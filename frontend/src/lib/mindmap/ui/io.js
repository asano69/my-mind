import { createRoot, createEffect, on } from "solid-js";
import * as backend from "../backend/pocketbase.js";
import { serializeCurrentMap } from "../backend/image.js";
import ItemNode from "../core/itemStore.js";
import {
  currentTitle,
  setCurrentTitle,
  titleAuto,
  setTitleAuto,
  setSaveStatus,
  dirtyVersion,
  setCurrentMapId,
  setCurrentMapUuid,
  autoSaveEnabled,
  setAutoSaveEnabled,
  setErrorDialogMessage,
  requestLeaveConfirm,
  setThrobberVisible,
  setOverrideRoot,
} from "../store.js";

// The tree/SVG root currently being edited, and the loader callback used
// to swap in a freshly restored root. This used to live behind a
// pluggable provider (setTreeProvider/setSvgNodeProvider/
// setRestoreProvider, previously registered by a separate newIo.js
// adapter module), so this file's save/autosave/delete bookkeeping could
// be shared between two engine implementations. Only one engine
// (ItemNode, see itemStore.js) exists now, so this module owns that
// state directly instead of indirecting through a provider it only ever
// has one implementation of.
let currentRoot = null;
let currentSvgNode = null;

// Registers `root`/`svgNode` as the source save/autosave/SVG-snapshot
// logic reads from. Called whenever the preview's root ItemNode
// (re)loads (see NewMindMapPreview.jsx).
export function attach(root, svgNode) {
  currentRoot = root;
  currentSvgNode = svgNode;
}

// Called on unmount so a stale root/svg node can't outlive this preview
// instance (e.g. leaking into the next mount before it re-attaches).
export function detach() {
  currentRoot = null;
  currentSvgNode = null;
}

// The currently attached root ItemNode / SVG node, or null before a map
// has loaded. Used by RightPanelExportActions.jsx's copy/download-image
// buttons to source backend/image.js's explicit svgNode/name parameters.
export function getRoot() {
  return currentRoot;
}
export function getSvgNode() {
  return currentSvgNode;
}

let currentMapId = null; // PocketBase record id, used for save/update calls
let currentMapUuid = null; // public uuid, used in the URL
// PocketBase "title" field itself now lives in store.js as a Solid signal
// (see CLAUDE.md, Solid migration Phase 4), kept independent of the root
// node's text (which is exposed separately as map.name) — see title.js.

let autoSaveTimeout = null;
let disposeAutoSaveEffect = null; // dispose fn for the createRoot below, cleared in dispose()

// Guards against overlapping save() calls. With a short auto-save debounce,
// a new save can be triggered before the previous request finishes; sending
// two concurrent updates to the same record risks the PocketBase SDK
// auto-cancelling one of them, or worse, an older snapshot overwriting a
// newer one if the requests resolve out of order.
let saveInFlight = false;
let saveAgainRequested = false;

const AUTO_SAVE_DELAY_MS = 1000;
const AUTO_SAVE_SETTING_KEY = "autoSaveEnabled";

// Warns the user before leaving the page (closing the tab, reloading, or
// navigating away outside the app) while the current map has never been
// saved and so has no server-assigned uuid yet. A map that already has a
// uuid is not covered here -- once a map exists on the server, its edits
// are safe (auto-save persists them); this only guards the narrow window
// before the very first save.
function handleBeforeUnload(e) {
  if (currentMapUuid) {
    return;
  }
  e.preventDefault();
  e.returnValue = "";
}

// The #io save-confirmation panel was removed: Ctrl+Shift+S now saves
// directly (see quickSave() below), so there is no longer a DOM node
// or focus state for this module to track.
export function init() {
  // Load the persisted auto-save preference (see backend/pocketbase.js's
  // getSetting()). Best-effort: if it fails or was never set, store.js's
  // signal keeps its default (enabled).
  backend.getSetting(AUTO_SAVE_SETTING_KEY).then((value) => {
    if (value !== null) {
      setAutoSaveEnabled(value === "true");
    }
  });

  // Auto-save: debounce item changes and save after a short delay.
  // Only kicks in once the map has been saved at least once (has an id)
  // and the auto-save preference (see setAutoSave() below) is enabled.

  // dirtyVersion is a store.js signal (see Phase 9.5), so this is a
  // vanilla-module effect and needs its own createRoot per the Phase 5
  // addendum's rule for effects created outside a component.
  // on(..., { defer: true }) skips the initial run at creation time,
  // matching pubsub.subscribe's old semantics of only firing on future
  // changes, not on subscription itself.
  createRoot((dispose) => {
    disposeAutoSaveEffect = dispose;
    createEffect(
      on(
        dirtyVersion,
        () => {
          // Any change makes the server copy stale, regardless of whether
          // auto-save is enabled or the map has ever been saved before.
          setSaveStatus("dirty");
          if (!currentMapId || !autoSaveEnabled()) {
            return;
          }
          if (autoSaveTimeout !== null) {
            clearTimeout(autoSaveTimeout);
          }
          autoSaveTimeout = setTimeout(() => {
            autoSaveTimeout = null;
            saveMap(); // auto-save: mymind only, no SVG
          }, AUTO_SAVE_DELAY_MS);
        },
        { defer: true },
      ),
    );
  });

  window.addEventListener("beforeunload", handleBeforeUnload);
}

// Toggles auto-save on/off (see RightPanel.jsx's footer switch) and
// persists the choice to PocketBase's "settings" collection so it
// survives reloads. Cancels any pending debounced save immediately when
// turned off, so an edit made just before disabling doesn't still get
// sent to the server a second later.
export async function setAutoSave(enabled) {
  setAutoSaveEnabled(enabled);
  if (!enabled && autoSaveTimeout !== null) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
  }
  try {
    await backend.setSetting(AUTO_SAVE_SETTING_KEY, String(enabled));
  } catch (e) {
    error(e);
  }
}

// Called by my-mind.js's unmount(). node's own click/keydown listeners die
// along with the DOM element (Solid removes #io on unmount), so only the
// module-level timer and map-identity state need explicit teardown here.
export function dispose() {
  window.removeEventListener("beforeunload", handleBeforeUnload);
  disposeAutoSaveEffect?.();
  disposeAutoSaveEffect = null;
  if (autoSaveTimeout !== null) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
  }
  currentMapId = null;
  currentMapUuid = null;
  setCurrentMapUuid(null);

  // Deliberately does NOT reset currentTitle to "" here. dispose() runs
  // on every map switch (unmount() before the next mount()'s async
  // io.restore() resolves), and restore() is a network round-trip -- if
  // currentTitle were cleared here, TopBar/title.js would flash
  // "Untitled" for that whole window. Leaving the previous map's title
  // visible until the new one loads (like a browser tab keeping its old
  // title while a page loads) is both simpler and less jarring.
  // setCurrentMap() (called by both restore() and resetCurrentMap())
  // always overwrites it as soon as the new value is known.
  setTitleAuto(true);
  setSaveStatus("saved");
  setCurrentMapId(null);

  saveInFlight = false;
  saveAgainRequested = false;
}

// uuid comes from the router's params (see Workspace.jsx/MindMapCanvas.jsx)
// instead of being re-parsed from location.pathname here — the router
// already knows the current uuid reactively, so re-deriving it from the
// URL string was redundant and could read a stale path during navigation.
//
// No longer called by anything: the engine loads its own tree directly
// (see NewMindMapPreview.jsx's loadPreviewRoot(), which calls
// newIo.applyLoadedRecord() to apply this same setCurrentMap()
// bookkeeping) instead of going through this uuid-based restore path.
// Kept as a small, self-contained helper in case a future caller wants
// "just fetch and register a map record" without owning its own tree
// loading.
export async function restore(uuid) {
  console.log("[io.restore] called with uuid =", uuid);
  if (!uuid) {
    setThrobberVisible(false);
    return false;
  }
  setThrobberVisible(true);
  try {
    const record = await backend.loadByUuid(uuid);
    console.log(
      "[io.restore] loaded record id =",
      record.id,
      "uuid =",
      record.uuid,
      "title =",
      record.title,
    );
    setCurrentMap(record);
    setThrobberVisible(false);
    return true;
  } catch (e) {
    console.log("[io.restore] error", e);
    error(e);
    return false;
  }
}

export function getTitle() {
  return currentTitle();
}

// Renames the map's title (the "title" field stored in PocketBase).
// An empty (after trim) title means "go back to following the root
// node's label" — switches to auto mode and immediately reflects the
// root's current text (map.js's shared layout computed keeps it synced
// from then on, on every subsequent root text edit). A non-empty title
// switches to manual mode and is kept exactly as given. Saves
// immediately if the map has already been saved once; otherwise the new
// title/mode just carries into the next save.
export async function setTitle(title) {
  const trimmed = title.trim();
  if (!trimmed) {
    setTitleAuto(true);
    const autoTitle = currentRoot ? currentRoot.name : "";
    setCurrentTitle(autoTitle);
    if (currentMapId) {
      try {
        await backend.updateTitle(currentMapId, autoTitle, true);
      } catch (e) {
        error(e);
      }
    }
    return;
  }
  if (trimmed === currentTitle() && !titleAuto()) {
    return;
  }
  setTitleAuto(false);
  setCurrentTitle(trimmed);
  if (currentMapId) {
    try {
      await backend.updateTitle(currentMapId, trimmed, false);
    } catch (e) {
      error(e);
    }
  }
}

export function quickSave() {
  return saveWithSvg();
}

// Runs `task` (a performSave call) respecting the in-flight guard above.
// If a save is already running, this just records that another run is
// needed and returns immediately; the in-progress run re-executes `task`
// once it finishes, so no update is lost even under rapid edits. Returns
// whether the save succeeded, so callers (e.g. the "Save" command's
// toast) can tell a real save from a failed one instead of assuming
// success just because the request round-tripped.
async function runGuarded(task) {
  if (saveInFlight) {
    saveAgainRequested = true;
    // Already-running save will pick this request up via the do/while
    // loop below; there's no result to report back for this call.
    return true;
  }
  saveInFlight = true;
  let success = true;
  try {
    do {
      saveAgainRequested = false;
      success = await task();
    } while (saveAgainRequested);
  } finally {
    saveInFlight = false;
  }
  return success;
}

// Auto-save: pushes the map JSON only, skipping the SVG snapshot.
// Used on every debounced item-change.
function saveMap() {
  return runGuarded(() => performSave(false));
}

// Explicit save: pushes the map JSON plus a freshly rendered SVG snapshot
// (used for the catalog thumbnail). Used by quickSave()/submit(), and by
// callers that need a fresh thumbnail before leaving the canvas (e.g.
// navigating to the catalog).
export function saveWithSvg() {
  return runGuarded(() => performSave(true));
}

// Best-effort save used before navigating away from the canvas
// (switching maps via the catalog/file-switcher, starting a new map,
// going to the catalog page). Unlike quickSave()/saveWithSvg(), this is
// never triggered by an explicit user action (the Save button,
// Ctrl+Shift+S) -- it's only here because leaving the canvas wants a
// fresh thumbnail. When the user has turned auto-save off, no save may
// happen here at all, or it would defeat the whole point of the toggle.
export function saveBeforeLeaving() {
  if (!autoSaveEnabled()) {
    return Promise.resolve();
  }
  return saveWithSvg();
}

// Called before any SPA navigation away from the current map (switching
// maps via the catalog/file-switcher, starting a new map, going to the
// catalog page). Saves first if auto-save is on (see saveBeforeLeaving()
// above); if the map still has no uuid afterwards -- auto-save is off,
// or the save itself failed -- asks the user to confirm discarding it
// (see store.js's requestLeaveConfirm(), rendered by
// LeaveConfirmDialog.jsx). Returns whether it's safe to proceed with
// leaving.
export async function confirmLeave() {
  await saveBeforeLeaving();
  if (currentMapUuid) {
    return true;
  }
  return requestLeaveConfirm();
}

async function performSave(includeSvg) {
  const mymind = { root: currentRoot.toJSON() };
  // While titleAuto is on, the title saved is always the root node's
  // current label; otherwise it's whatever the user explicitly set.
  const auto = titleAuto();
  const title = auto ? currentRoot.name : currentTitle();
  // SVG snapshot generation is somewhat expensive and only needed for the
  // catalog page thumbnail, so it's skipped on auto-save (includeSvg=false)
  // and only computed when the user explicitly saves.
  let svg;
  if (includeSvg) {
    try {
      svg = serializeCurrentMap(currentSvgNode).xml;
    } catch (e) {
      console.warn("failed to generate SVG snapshot:", e);
    }
  }
  try {
    const record = await backend.save(currentMapId, title, mymind, svg, auto);
    setCurrentMap(record);
    return true;
  } catch (e) {
    setSaveStatus("error");
    error(e);
    return false;
  }
}
export function setCurrentMap(record) {
  currentMapId = record ? record.id : null;
  currentMapUuid = record ? record.uuid : null;
  setCurrentTitle(record ? record.title || "" : "");
  setTitleAuto(record ? (record.titleAuto ?? true) : true);
  setCurrentMapId(currentMapId);
  setCurrentMapUuid(currentMapUuid);
  // A record just loaded from (or written to) the server is by definition
  // in sync with it -- covers restore(), performSave()'s success path,
  // resetCurrentMap(), and deleteCurrentMap() all at once.
  setSaveStatus("saved");
  updateURL();
}
// Called by command/command.js's New command after starting a fresh
// blank map, so the save/title state resets along with the canvas
// (replaces the old "map-new" pubsub message).
export function resetCurrentMap() {
  setCurrentMap(null);
}

// Replaces the currently open map's root with a past snapshot's content
// (see SnapshotsList.jsx). The map's identity (currentMapId/currentMapUuid)
// is left untouched, so a subsequent save overwrites the same record with
// the restored content instead of creating a new map. Does not save by
// itself — the user must explicitly save afterwards.
export function restoreSnapshot(snapshot) {
  setOverrideRoot(ItemNode.fromJSON(snapshot.mymind.root));
}

// Deletes the currently open map (if it has been saved at least once)
// and resets local map-identity state, mirroring Catalog.jsx's
// handleDelete. Does nothing for a never-saved map, since there is no
// PocketBase record to delete yet.
export async function deleteCurrentMap() {
  if (!currentMapId) {
    return;
  }
  try {
    await backend.deleteMap(currentMapId);
    setCurrentMap(null);
  } catch (e) {
    error(e);
  }
}

function updateURL() {
  // Preserves the current query string (e.g. "?newEngine=1") -- this
  // used to always drop it, which was harmless for the old engine (it
  // has no query-string-driven behavior) but silently kicked the new
  // engine's preview back to the default path every time a map was
  // loaded or saved, since this now also runs from the new engine's
  // newIo.js adapter.
  const search = globalThis.location?.search ?? "";
  if (!currentMapUuid) {
    history.replaceState(null, "", `/${search}`);
  } else {
    history.replaceState(
      null,
      "",
      `/maps/${encodeURIComponent(currentMapUuid)}${search}`,
    );
  }
}

// Fix for the "[object Object]" bug: PocketBase client errors are
// ClientResponseError instances (which extend Error), but be defensive
// about any non-Error rejection too, so the alert is always readable.
// Field-level validation errors (e.g. wrong type, required, too long)
// live in e.response.data — surface them so the message stays actionable.
function error(e) {
  setThrobberVisible(false);
  let message = e instanceof Error ? e.message : JSON.stringify(e);
  const fieldErrors = e?.response?.data;
  if (fieldErrors && Object.keys(fieldErrors).length) {
    const detail = Object.entries(fieldErrors)
      .map(([field, info]) => `${field}: ${info.message || info.code}`)
      .join("; ");
    message = `${message} (${detail})`;
  }
  setErrorDialogMessage(`IO error: ${message}`);
}
