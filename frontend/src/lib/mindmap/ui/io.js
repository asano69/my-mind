import { createRoot, createEffect, on } from "solid-js";
import * as app from "../my-mind.js";
import * as backend from "../backend/pocketbase.js";
import MindMap from "../map.js";
import { serializeCurrentMap } from "../backend/image.js";
import {
  currentTitle,
  setCurrentTitle,
  setLastSaveTime,
  dirtyVersion,
  setCurrentMapId,
  autoSaveEnabled,
  setAutoSaveEnabled,
} from "../store.js";

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
  disposeAutoSaveEffect?.();
  disposeAutoSaveEffect = null;
  if (autoSaveTimeout !== null) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
  }
  currentMapId = null;
  currentMapUuid = null;

  setCurrentTitle("");
  setLastSaveTime(null);
  setCurrentMapId(null);

  saveInFlight = false;
  saveAgainRequested = false;
}

// uuid comes from the router's params (see Workspace.jsx/MindMapCanvas.jsx)
// instead of being re-parsed from location.pathname here — the router
// already knows the current uuid reactively, so re-deriving it from the
// URL string was redundant and could read a stale path during navigation.
export async function restore(uuid) {
  console.log("[io.restore] called with uuid =", uuid);
  if (!uuid) {
    app.setThrobber(false);
    return false;
  }
  app.setThrobber(true);
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
    app.setThrobber(false);
    app.showMap(MindMap.fromJSON(record.mymind));
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

// Renames the map's title (the "title" field stored in PocketBase),
// independent of the mindmap's root node text. Saves immediately if the
// map has already been saved once; otherwise the new title just carries
// into the next save.
export async function setTitle(title) {
  if (title === currentTitle()) {
    return;
  }
  setCurrentTitle(title);
  if (currentMapId) {
    try {
      await backend.updateTitle(currentMapId, title);
    } catch (e) {
      error(e);
    }
  }
}

export function quickSave() {
  saveWithSvg();
}

// Runs `task` (a performSave call) respecting the in-flight guard above.
// If a save is already running, this just records that another run is
// needed and returns immediately; the in-progress run re-executes `task`
// once it finishes, so no update is lost even under rapid edits.
async function runGuarded(task) {
  if (saveInFlight) {
    saveAgainRequested = true;
    return;
  }
  saveInFlight = true;
  try {
    do {
      saveAgainRequested = false;
      await task();
    } while (saveAgainRequested);
  } finally {
    saveInFlight = false;
  }
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

async function performSave(includeSvg) {
  const map = app.currentMap;
  const mymind = map.toJSON();
  // Use the explicitly-set title if present; otherwise fall back to the
  // root node's name (only relevant for maps that have never had a
  // custom title set).
  const title = currentTitle() || map.name;
  // SVG snapshot generation is somewhat expensive and only needed for the
  // catalog page thumbnail, so it's skipped on auto-save (includeSvg=false)
  // and only computed when the user explicitly saves.
  let svg;
  if (includeSvg) {
    try {
      svg = serializeCurrentMap().xml;
    } catch (e) {
      console.warn("failed to generate SVG snapshot:", e);
    }
  }
  try {
    const record = await backend.save(currentMapId, title, mymind, svg);
    setCurrentMap(record);
    setLastSaveTime(Date.now());
  } catch (e) {
    error(e);
  }
}
function setCurrentMap(record) {
  currentMapId = record ? record.id : null;
  currentMapUuid = record ? record.uuid : null;
  setCurrentTitle(record ? record.title || "" : "");
  setCurrentMapId(currentMapId);
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
  app.showMap(MindMap.fromJSON(snapshot.mymind));
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
  if (!currentMapUuid) {
    history.replaceState(null, "", "/");
  } else {
    history.replaceState(
      null,
      "",
      `/maps/${encodeURIComponent(currentMapUuid)}`,
    );
  }
}

// Fix for the "[object Object]" bug: PocketBase client errors are
// ClientResponseError instances (which extend Error), but be defensive
// about any non-Error rejection too, so the alert is always readable.
// Field-level validation errors (e.g. wrong type, required, too long)
// live in e.response.data — surface them so the message stays actionable.
function error(e) {
  app.setThrobber(false);
  let message = e instanceof Error ? e.message : JSON.stringify(e);
  const fieldErrors = e?.response?.data;
  if (fieldErrors && Object.keys(fieldErrors).length) {
    const detail = Object.entries(fieldErrors)
      .map(([field, info]) => `${field}: ${info.message || info.code}`)
      .join("; ");
    message = `${message} (${detail})`;
  }
  alert(`IO error: ${message}`);
}

// Pure formatting helper, read directly by RightPanel.jsx (see CLAUDE.md's
// Solid migration Phase 5 addendum, "read-only consumption -- no bridge
// object needed"). Takes `now` as a parameter rather than reading
// Date.now() internally, since lastSaveTime() itself only changes on an
// actual save -- RightPanel.jsx supplies its own 1s ticking signal to
// drive the re-render that keeps this label advancing between saves.
export function formatSaveStatus(savedAt, now = Date.now()) {
  if (savedAt === null) {
    return "";
  }
  const elapsed = Math.floor((now - savedAt) / 1000);
  if (elapsed < 2) {
    return "just saved!";
  }
  if (elapsed < 5) {
    return "<5s ago";
  }
  if (elapsed < 10) {
    return "<10s ago";
  }
  if (elapsed < 60) {
    return `${Math.floor(elapsed / 10) * 10}s ago`;
  }
  return `${Math.floor(elapsed / 60)}m ago`;
}
