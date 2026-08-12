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

// The anchor for a Shift+Arrow selection-extension chain, analogous to
// my-mind.js's app.selectionCursor. See extendSelection() below.
export const [selectionCursor, setSelectionCursor] = createSignal(null);

// Clears any multi-selection without touching currentItem, mirroring
// my-mind.js's clearMultiSelection() -- but item.js's unmarkSelected()
// DOM calls have no counterpart here, since itemStateClassList() (see
// below) already derives its display purely from these signals.
export function clearMultiSelection() {
  setSelectedItems(new Set());
  setSelectionCursor(null);
}

// Extends the multi-selection from the current selectionCursor (or
// currentItem, if no cursor exists yet) to `item`, mirroring
// my-mind.js's extendSelection() -- used by Shift+Arrow (see
// newKeyboard.js's SelectAdd-equivalent command).
export function extendSelection(item) {
  if (item === currentItem()) {
    clearMultiSelection();
    return;
  }
  const cursor = selectionCursor();
  const selected = selectedItems();
  if (cursor !== null && selected.has(item)) {
    const updated = new Set(selected);
    updated.delete(cursor);
    setSelectedItems(updated);
    setSelectionCursor(item);
    return;
  }
  const updated = new Set(selected);
  updated.add(item);
  setSelectedItems(updated);
  setSelectionCursor(item);
}

// Sets the single focused item and drops any multi-selection, mirroring
// my-mind.js's selectItem(). Editing is not integrated yet (see Phase
// 4.5), so unlike the old engine's version this never needs to finish
// an in-progress edit before switching selection.
export function selectItem(item) {
  clearMultiSelection();
  setCurrentItem(item);
}

// Ctrl/Cmd+click toggle, mirroring my-mind.js's addToSelection(). Always
// swaps in a fresh Set (see the module comment on selectedItems) rather
// than mutating the current one in place.
export function addToSelection(item) {
  setSelectionCursor(null);
  const current = currentItem();
  if (item === current) {
    const selected = selectedItems();
    if (selected.size === 0) {
      return;
    }
    // Promote one previously multi-selected item to be the new current
    // item, same as my-mind.js's own "toggling off the current item
    // hands focus to another selected item" behavior.
    const next = selected.values().next().value;
    const updated = new Set(selected);
    updated.delete(next);
    setSelectedItems(updated);
    setCurrentItem(next);
    return;
  }
  const updated = new Set(selectedItems());
  if (updated.has(item)) {
    updated.delete(item);
  } else {
    updated.add(item);
  }
  setSelectedItems(updated);
}

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
