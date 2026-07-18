// src/my-mind.js
import { createRoot, createEffect, on } from "solid-js";
import { setCurrentItem, leftPanelHidden, rightPanelHidden } from "./store.js";
// Application entry point. Owns global editor state (current map/item/selection,
// undo history) and boots all the input/UI subsystems on load.
//
// Command modules are imported here purely for their registration side effects:
// each one calls `new (class ... extends Command)` at module scope, which adds
// itself to command/command.js's repo.
import "./command/command.js";
import "./command/edit.js";
import "./command/select.js";

// Registers every layout/shape kind into their respective repos (see
// layout/layout.js's and shape/shape.js's `repo` Maps). This used to be a
// side-effect import inside ui/layout.js and ui/shape.js, but those modules
// were replaced by RightPanel.jsx (see CLAUDE.md, Solid migration
// Phase 3); the registration itself is engine-wide (item.js's
// resolvedShape/resolvedLayout depend on it), so it lives here now.
import "./layout/graph.js";
import "./layout/tree.js";
import "./layout/map.js";

import "./format/plaintext.js";

import "./shape/box.js";
import "./shape/ellipse.js";
import "./shape/underline.js";

import { repo as commandRepo, setKeyboardScope } from "./command/command.js";
import Map, { init as initMapCSS } from "./map.js";
import * as history from "./history.js";

import * as keyboard from "./keyboard.js";
import * as mouse from "./mouse.js";
import * as clipboard from "./clipboard.js";
import * as title from "./title.js";
import * as ui from "./ui/ui.js";

let port = null;
let spinner = null;
let mounted = false;
let disposePanelEffects = null; // dispose fn for the effects below, cleared in unmount()

export let currentMap = null;
export let currentItem = null;
export let editing = false;
export const selectedItems = new Set();
export let selectionCursor = null;

export function setThrobber(visible) {
  spinner.hidden = !visible;
}

export function showMap(map) {
  if (currentMap) {
    currentMap.hide();
  }
  history.reset();
  currentMap = map;
  currentMap.show(port);
}

export function action(action) {
  history.push(action);
  action.do();
}

export function clearMultiSelection() {
  selectedItems.forEach((item) => item.unmarkSelected());
  selectedItems.clear();
  selectionCursor = null;
}

export function extendSelection(item) {
  if (item === currentItem) {
    clearMultiSelection();
    return;
  }
  if (selectionCursor !== null && selectedItems.has(item)) {
    selectedItems.delete(selectionCursor);
    selectionCursor.unmarkSelected();
    selectionCursor = item;
    return;
  }
  selectedItems.add(item);
  item.markSelected();
  selectionCursor = item;
}

export function addToSelection(item) {
  selectionCursor = null;
  if (item === currentItem) {
    if (selectedItems.size === 0) {
      return;
    }
    let next = selectedItems.values().next().value;
    selectedItems.delete(next);
    next.unmarkSelected();
    currentItem.deselect();
    currentItem = next;
    currentItem.select();
    return;
  }
  if (selectedItems.has(item)) {
    selectedItems.delete(item);
    item.unmarkSelected();
  } else {
    selectedItems.add(item);
    item.markSelected();
  }
}

export function getAllSelected() {
  let all = [currentItem];
  selectedItems.forEach((item) => all.push(item));
  return all;
}

export function selectItem(item) {
  clearMultiSelection();
  if (currentItem && currentItem != item) {
    if (editing) {
      commandRepo.get("finish").execute();
    }
    currentItem.deselect();
  }
  currentItem = item;
  // Keep store.js's Solid signal in sync so RightPanel.jsx (and any
  // future Solid component) can react to selection changes directly,
  // per the Solid migration plan's Phase 3 (see CLAUDE.md).
  setCurrentItem(item);
  currentItem.select();
  currentMap.ensureItemVisibility(currentItem);
}

export function startEditing() {
  clearMultiSelection();
  editing = true;
  currentItem.startEditing();
}

export function stopEditing() {
  editing = false;
  return currentItem.stopEditing();
}

// Reads one of #left-panel's two width states directly from CSS (see
// my-mind.css's :root), so the JS layout math never drifts out of sync
// with the actual rendered panel width.
function cssPixelVar(name) {
  return parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name),
  );
}

// Exported so ui.js can call it directly after toggling the property
// panel, replacing the old "ui-change" pubsub message (see CLAUDE.md,
// Solid migration Phase 9.4).
export function handleResize() {
  // #left-panel is a push panel, not an overlay: <main> is offset by
  // its current width so the canvas never sits underneath it.
  const leftWidth = leftPanelHidden()
    ? cssPixelVar("--ribbon-width")
    : cssPixelVar("--side-panel-width");
  // #ui (the right panel) no longer has a ribbon: it collapses fully to
  // 0 width, and its open/close tab lives outside the flow (see
  // RightPanel.jsx), so the canvas only needs to reserve space when the
  // panel is actually expanded.
  const rightWidth = rightPanelHidden() ? 0 : cssPixelVar("--side-panel-width");

  const size = [window.innerWidth - leftWidth - rightWidth, window.innerHeight];
  port.style.marginLeft = `${leftWidth}px`;
  port.style.width = `${size[0]}px`;
  port.style.height = `${size[1]}px`;
  currentMap && currentMap.ensureItemVisibility(currentItem);
}

// Boots the whole engine into `root` (the <main> element). `containerEl`
// is the shared focusable wrapper around the whole route (see
// MindMapCanvas.jsx), used as the focus target for keyboard shortcuts
// once mouse/keyboard interactions move off the canvas element itself.
// Safe to call only once per unmount(): a second call while already
// mounted is a no-op, since remounting on top of live listeners/state
// would double them up.
export async function mount(root, containerEl) {
  if (mounted) {
    return;
  }
  mounted = true;
  port = root;
  spinner = document.querySelector(".spinner");

  setThrobber(true);
  await initMapCSS();

  window.addEventListener("resize", handleResize);
  clipboard.init();
  setKeyboardScope(containerEl);
  keyboard.init(containerEl);
  mouse.init(port, containerEl);
  title.init();
  ui.init(port); // also calls io.restore() internally

  createRoot((dispose) => {
    disposePanelEffects = dispose;
    createEffect(on(leftPanelHidden, handleResize, { defer: true }));
    createEffect(on(rightPanelHidden, handleResize, { defer: true }));
  });

  handleResize();
  showMap(new Map());
  setThrobber(false);
}

// Tears down everything mount() set up, in reverse order, so a subsequent
// mount() starts from a clean slate. Safe to call only when mounted.
export function unmount() {
  if (!mounted) {
    return;
  }
  window.removeEventListener("resize", handleResize);
  ui.dispose();
  title.dispose();

  disposePanelEffects?.();
  disposePanelEffects = null;

  mouse.dispose();
  commandRepo.get("pan")?.dispose?.();
  keyboard.dispose(containerEl);
  setKeyboardScope();
  clipboard.dispose();

  history.reset();
  currentMap?.hide();
  currentMap = null;
  currentItem = null;
  setCurrentItem(null);
  editing = false;
  selectedItems.clear();
  selectionCursor = null;

  port = null;
  spinner = null;
  mounted = false;
}
