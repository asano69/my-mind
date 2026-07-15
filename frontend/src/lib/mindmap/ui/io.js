// src/ui/io.ts
import * as pubsub from "../pubsub.js";
import * as app from "../my-mind.js";
import * as backend from "../backend/pocketbase.js";
import MindMap from "../map.js";

let currentMapId = null; // PocketBase record id, used for save/update calls
let currentMapUuid = null; // public uuid, used in the URL

let autoSaveTimeout = null;
let lastSaveTime = null;

const node = document.querySelector("#io");
const AUTO_SAVE_DELAY_MS = 3000;

export function isActive() {
  return !node.hidden && node.contains(document.activeElement);
}

export function init() {
  node.querySelector(".cancel").addEventListener("click", (_) => hide());
  node.querySelector(".go").addEventListener("click", (_) => submit());
  node.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hide();
    }
  });
  pubsub.subscribe("map-new", (_) => setCurrentMap(null));
  pubsub.subscribe("save-done", () => {
    lastSaveTime = Date.now();
    updateSaveStatus();
    hide();
  });
  pubsub.subscribe("load-done", () => hide());
  setInterval(updateSaveStatus, 1000);
  // Auto-save: debounce item changes and save after a short delay.
  // Only kicks in once the map has been saved at least once (has an id).
  pubsub.subscribe("item-change", () => {
    if (!currentMapId) {
      return;
    }
    if (autoSaveTimeout !== null) {
      clearTimeout(autoSaveTimeout);
    }
    autoSaveTimeout = setTimeout(() => {
      autoSaveTimeout = null;
      save();
    }, AUTO_SAVE_DELAY_MS);
  });
}

// Maps are addressed by a public uuid via /maps/<uuid>, not by
// PocketBase's own record id.
export async function restore() {
  const match = location.pathname.match(/^\/maps\/([^/]+)$/);
  if (!match) {
    app.setThrobber(false);
    return;
  }
  app.setThrobber(true);
  try {
    const record = await backend.loadByUuid(match[1]);
    setCurrentMap(record);
    app.setThrobber(false);
    app.showMap(MindMap.fromJSON(record.mymind));
    pubsub.publish("load-done");
  } catch (e) {
    error(e);
  }
}

// Placeholder until a dedicated title-input component exists (see CLAUDE.md
// "Work in progress"). Title is meant to be settable independently of the
// root node's text, but until that UI is built, every save just uses this.
const PLACEHOLDER_TITLE = "Untitled";

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
    save();
  } else {
    show();
  }
}

function submit() {
  save();
}

async function save() {
  app.setThrobber(true);
  const map = app.currentMap;
  const mymind = map.toJSON();
  try {
    const record = await backend.save(currentMapId, PLACEHOLDER_TITLE, mymind);
    setCurrentMap(record);
    app.setThrobber(false);
    pubsub.publish("save-done");
  } catch (e) {
    error(e);
  }
}

function setCurrentMap(record) {
  currentMapId = record ? record.id : null;
  currentMapUuid = record ? record.uuid : null;
  updateURL();
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
function error(e) {
  app.setThrobber(false);
  const message = e instanceof Error ? e.message : JSON.stringify(e);
  alert(`IO error: ${message}`);
}

function updateSaveStatus() {
  const el = document.getElementById("save-status");
  if (!el) {
    return;
  }
  if (lastSaveTime === null) {
    el.textContent = "";
    return;
  }
  const elapsed = Math.floor((Date.now() - lastSaveTime) / 1000);
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
