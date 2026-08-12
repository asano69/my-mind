// itemSelection.js — selection state for the ?newEngine=1 preview.
//
// Mirrors my-mind.js's app.currentItem / app.selectedItems / app.
// selectionCursor, but lives in its own module rather than being added
// to store.js -- per docs/08-phase4-mindmap-engine-refactor.md's Phase
// 4.2, new-engine-only state should not leak into the old engine's
// store.js. Once Phase 4.9 unifies the two engines, this module (or
// its replacement) becomes the single source of truth and store.js's
// currentItem can re-export from here.
//
// This is Phase 4.2 specifically: state + display wiring only. Nothing
// here is written by real user input yet (no click/keyboard handlers)
// -- that lands in Phase 4.3 (click selection) and Phase 4.4 (keyboard).
import { createSignal } from "solid-js";

// The single "focused" item, analogous to my-mind.js's app.currentItem.
export const [currentItem, setCurrentItem] = createSignal(null);

// Multi-selected items (Ctrl/Cmd+click), analogous to my-mind.js's
// app.selectedItems. Solid does not track in-place mutations to a Set,
// so callers must always swap in a fresh Set via setSelectedItems()
// rather than mutating the current one -- mutating it in place would
// leave reactive reads (isSelected() below) silently stale.
export const [selectedItems, setSelectedItems] = createSignal(new Set());

export function isCurrent(item) {
  return currentItem() === item;
}

export function isSelected(item) {
  return selectedItems().has(item);
}

// Small helper for JSX classList bindings (see NewMindMapPreview.jsx's
// ItemNodeView), matching item.js's select()/markSelected() -- both of
// which toggle "current"/"selected" classes on the item's own <g>
// element (not its .content div), the classes map.css's selector rules
// target (e.g. "[data-shape=box].item.current > foreignObject > .content").
export function itemStateClassList(item) {
  return {
    current: isCurrent(item),
    selected: isSelected(item),
  };
}
