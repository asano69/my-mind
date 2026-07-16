import * as pubsub from "../pubsub.js";
import * as app from "../my-mind.js";
import * as notes from "./notes.js";
import * as io from "./io.js";
import * as menu from "./context-menu.js";
import { repo as commandRepo } from "../command/command.js";
import { lastSaveTime } from "../store.js";

let node = null;
let saveTimeEl = null;
let elapsedTimer = null;

/** Format a Date as HH:MM:SS. */
function formatTime(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
/** Format elapsed milliseconds as a human-readable string.
 *  <5s  → "now"
 *  <60s → "<1m"
 *  <60m → "Xm ago"
 *  else → "Xh ago"
 */
function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 5) {
    return "now";
  }
  if (s < 60) {
    return "<1m";
  }
  const m = Math.floor(s / 60);
  if (m < 60) {
    return `${m}m ago`;
  }
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

/** Refresh the elapsed portion of the save-time display, reading the
 *  shared save timestamp from store.js (see CLAUDE.md, Solid migration
 *  Phase 4) instead of a locally tracked copy. */
function refreshElapsed() {
  const savedAt = lastSaveTime();
  if (savedAt === null || !saveTimeEl) {
    return;
  }
  const elapsed = Date.now() - savedAt;
  const timeStr = formatTime(new Date(savedAt));
  saveTimeEl.textContent = `${timeStr}  (${formatElapsed(elapsed)})`;
}
export function isActive() {
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLSelectElement ||
    active instanceof HTMLTextAreaElement
  ) {
    return true;
  }
  // The mindmap engine's own item-text editing is a contentEditable div;
  // any other contentEditable region belongs to some other part of the UI
  // (and should not receive mindmap shortcuts).
  if (active?.isContentEditable && active !== app.currentItem?.dom.text) {
    return true;
  }
  return io.isActive();
}

export function toggle() {
  node.hidden = !node.hidden;
  pubsub.publish("ui-change");
}
export function getWidth() {
  return node.hidden ? 0 : node.offsetWidth;
}
function onClick(e) {
  let target = e.target;
  if (target == node.querySelector("#toggle")) {
    // fixme nelibi
    toggle();
    return;
  }
  let current = target;
  while (true) {
    let command = current.dataset.command;
    if (command) {
      commandRepo.get(command).execute();
      return;
    }
    if (current.parentNode instanceof Element) {
      current = current.parentNode;
    } else {
      return;
    }
  }
}
export function init(port) {
  node = document.querySelector("#ui");
  saveTimeEl = document.querySelector("#save-time");
  // layout/shape/value/status no longer live here — see PropertyPanel.jsx,
  // which reads store.js's `currentItem` signal directly instead of being
  // driven by this module's init()/dispose()/pubsub wiring (Solid migration
  // Phase 3, see CLAUDE.md).
  [notes, io].forEach((ui) => ui.init());
  menu.init(port);
  // Poll store.js's `lastSaveTime` signal once a second instead of
  // subscribing to the old "save-done" pubsub message (Solid migration
  // Phase 4, see CLAUDE.md).
  elapsedTimer = setInterval(refreshElapsed, 1000);
  document.addEventListener("click", onClick);
  io.restore();
}

// Called by my-mind.js's unmount(). Tears down this module's own listener
// and timer, then disposes every child UI module in the reverse order
// init() brought them up, mirroring standard stack-unwind teardown order.
export function dispose() {
  document.removeEventListener("click", onClick);
  clearInterval(elapsedTimer);
  elapsedTimer = null;
  menu.dispose();
  [io, notes].forEach((ui) => ui.dispose());
  node = null;
  saveTimeEl = null;
}
