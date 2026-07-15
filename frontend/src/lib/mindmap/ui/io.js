// src/ui/io.ts
import * as pubsub from "../pubsub.js";
import * as app from "../my-mind.js";
import * as backend from "../backend/pocketbase.js";
import MindMap from "../map.js";

let currentMapId = null;

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

// Maps are addressed by PocketBase record id via ?id=..., not by filename path.
export async function restore() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  if (!id) {
    app.setThrobber(false);
    return;
  }
  app.setThrobber(true);
  try {
    const record = await backend.load(id);
    currentMapId = record.id;
    app.setThrobber(false);
    app.showMap(MindMap.fromJSON(record.mymind));
    pubsub.publish("load-done");
  } catch (e) {
    error(e);
  }
}

// Always opens the "save" dialog: with the PocketBase backend, loading a
// map by name is handled by the file-switcher (Ctrl+K) instead, so this
// panel only ever needs to support saving/renaming.
export function show() {
  node.hidden = false;
  requestAnimationFrame(() => {
    const input = node.querySelector(".name");
    if (!input) {
      return;
    }
    input.value = app.currentMap.name || "";
    input.focus();
    input.select();
  });
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
  const input = node.querySelector(".name");
  const name = (input && input.value.trim()) || map.name;
  const mymind = map.toJSON();
  try {
    const record = await backend.save(currentMapId, name, mymind);
    setCurrentMap(record.id);
    app.setThrobber(false);
    pubsub.publish("save-done");
  } catch (e) {
    error(e);
  }
}

function setCurrentMap(id) {
  currentMapId = id;
  updateURL();
}

function updateURL() {
  if (!currentMapId) {
    history.replaceState(null, "", "/");
  } else {
    history.replaceState(null, "", `?id=${encodeURIComponent(currentMapId)}`);
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
