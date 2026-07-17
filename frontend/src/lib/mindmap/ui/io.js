import { createRoot, createEffect, on } from "solid-js";
import * as app from "../my-mind.js";
import * as backend from "../backend/pocketbase.js";
import MindMap from "../map.js";
import { serializeCurrentMap } from "../backend/image.js";
import {
  currentTitle,
  setCurrentTitle,
  lastSaveTime,
  setLastSaveTime,
  dirtyVersion,
} from "../store.js";

let currentMapId = null; // PocketBase record id, used for save/update calls
let currentMapUuid = null; // public uuid, used in the URL
// PocketBase "title" field itself now lives in store.js as a Solid signal
// (see CLAUDE.md, Solid migration Phase 4), kept independent of the root
// node's text (which is exposed separately as map.name) — see title.js.

let autoSaveTimeout = null;
let statusTimer = null; // setInterval id for updateSaveStatus, cleared in dispose()
let disposeAutoSaveEffect = null; // dispose fn for the createRoot below, cleared in dispose()

// Guards against overlapping save() calls. With a short auto-save debounce,
// a new save can be triggered before the previous request finishes; sending
// two concurrent updates to the same record risks the PocketBase SDK
// auto-cancelling one of them, or worse, an older snapshot overwriting a
// newer one if the requests resolve out of order.
let saveInFlight = false;
let saveAgainRequested = false;

let node = null;

const AUTO_SAVE_DELAY_MS = 1000;

export function isActive() {
  return !node.hidden && node.contains(document.activeElement);
}

export function init() {
  node = document.querySelector("#io");
  node.querySelector(".cancel").addEventListener("click", (_) => hide());
  node.querySelector(".go").addEventListener("click", (_) => submit());
  node.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hide();
    }
  });

  statusTimer = setInterval(updateSaveStatus, 1000);
  // Auto-save: debounce item changes and save after a short delay.
  // Only kicks in once the map has been saved at least once (has an id).

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
          if (!currentMapId) {
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

// Called by my-mind.js's unmount(). node's own click/keydown listeners die
// along with the DOM element (Solid removes #io on unmount), so only the
// module-level timer and map-identity state need explicit teardown here.
export function dispose() {
  clearInterval(statusTimer);
  statusTimer = null;
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

  saveInFlight = false;
  saveAgainRequested = false;
  node = null;
}

export async function restore() {
  const match = location.pathname.match(/^\/maps\/([^/]+)$/);
  if (!match) {
    app.setThrobber(false);
    return;
  }
  const uuid = match[1];
  app.setThrobber(true);
  try {
    const record = await backend.loadByUuid(uuid);
    setCurrentMap(record);
    app.setThrobber(false);
    app.showMap(MindMap.fromJSON(record.mymind));
    hide();
  } catch (e) {
    error(e);
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

export function show() {
  node.hidden = false;
}

export function hide() {
  if (node.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  node.hidden = true;
}

export function quickSave() {
  if (currentMapId) {
    saveWithSvg();
  } else {
    show();
  }
}

function submit() {
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
    updateSaveStatus();
    hide();
  } catch (e) {
    error(e);
  }
}
function setCurrentMap(record) {
  currentMapId = record ? record.id : null;
  currentMapUuid = record ? record.uuid : null;
  setCurrentTitle(record ? record.title || "" : "");
  updateURL();
}
// Called by command/command.js's New command after starting a fresh
// blank map, so the save/title state resets along with the canvas
// (replaces the old "map-new" pubsub message).
export function resetCurrentMap() {
  setCurrentMap(null);
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

function updateSaveStatus() {
  const el = document.getElementById("save-status");
  if (!el) {
    return;
  }
  const savedAt = lastSaveTime();
  if (savedAt === null) {
    el.textContent = "";
    return;
  }
  const elapsed = Math.floor((Date.now() - savedAt) / 1000);
  if (elapsed < 2) {
    el.textContent = "just saved!";
  } else if (elapsed < 5) {
    el.textContent = "<5s ago";
  } else if (elapsed < 10) {
    el.textContent = "<10s ago";
  } else if (elapsed < 60) {
    el.textContent = `${Math.floor(elapsed / 10) * 10}s ago`;
  } else {
    el.textContent = `${Math.floor(elapsed / 60)}m ago`;
  }
}
