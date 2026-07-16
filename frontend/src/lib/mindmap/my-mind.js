// src/my-mind.js
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
// were replaced by PropertyPanel.jsx (see CLAUDE.md, Solid migration
// Phase 3); the registration itself is engine-wide (item.js's
// resolvedShape/resolvedLayout depend on it), so it lives here now.
import "./layout/graph.js";
import "./layout/tree.js";
import "./layout/map.js";

import "./format/plaintext.js";

import "./shape/box.js";
import "./shape/ellipse.js";
import "./shape/underline.js";

import { repo as commandRepo } from "./command/command.js";
import Map, { init as initMapCSS } from "./map.js";
import * as history from "./history.js";
import * as pubsub from "./pubsub.js";
import * as keyboard from "./keyboard.js";
import * as mouse from "./mouse.js";
import * as clipboard from "./clipboard.js";
import * as title from "./title.js";
import * as help from "./help.js";
import * as ui from "./ui/ui.js";
import { setCurrentItem } from "./store.js";

let port = null;
let spinner = null;
let mounted = false;

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
  // Keep store.js's Solid signal in sync so PropertyPanel.jsx (and any
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

function handleResize() {
  const size = [window.innerWidth - ui.getWidth(), window.innerHeight];
  port.style.width = `${size[0]}px`;
  port.style.height = `${size[1]}px`;
  currentMap && currentMap.ensureItemVisibility(currentItem);
}

// Boots the whole engine into `root` (the <main> element). Safe to call
// only once per unmount(): a second call while already mounted is a no-op,
// since remounting on top of live listeners/state would double them up.
export async function mount(root) {
  if (mounted) {
    return;
  }
  mounted = true;
  port = root;
  spinner = document.querySelector(".spinner");

  setThrobber(true);
  await initMapCSS();
  pubsub.subscribe("ui-change", handleResize);
  window.addEventListener("resize", handleResize);
  clipboard.init();
  keyboard.init();
  mouse.init(port);
  title.init();
  ui.init(port); // also calls io.restore() internally
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
  help.dispose();
  mouse.dispose();
  keyboard.dispose();
  clipboard.dispose();
  pubsub.reset();
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
