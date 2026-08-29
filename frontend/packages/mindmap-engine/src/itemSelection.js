// itemSelection.js — selection state for the mindmap engine.
//
// Mirrors my-mind.js's app.currentItem / app.selectedItems / app.
// selectionCursor. createItemSelection() below closes the state into a
// per-instance factory, per docs/mind-map-core-engine-library/01-plan.md's
// Step 5 -- the module-level default instance further down preserves
// every existing call site unchanged during the migration.
import { createSignal } from "solid-js";

export function createItemSelection() {
  // The single "focused" item, analogous to my-mind.js's app.currentItem.
  const [currentItem, setCurrentItem] = createSignal(null);

  // Multi-selected items (Ctrl/Cmd+click), analogous to my-mind.js's
  // app.selectedItems. Solid does not track in-place mutations to a Set,
  // so callers must always swap in a fresh Set via setSelectedItems()
  // rather than mutating the current one -- mutating it in place would
  // leave reactive reads (isSelected() below) silently stale.
  const [selectedItems, setSelectedItems] = createSignal(new Set());

  // The anchor for a Shift+Arrow selection-extension chain, analogous to
  // my-mind.js's app.selectionCursor. See extendSelection() below.
  const [selectionCursor, setSelectionCursor] = createSignal(null);

  // Whether the currentItem is in live text-edit mode, analogous to
  // my-mind.js's app.editing / store.js's editing signal for the old
  // engine. Written by newKeyboard.js's Space/Enter/Escape commands and
  // newMouse.js's double-click handler; read by newKeyboard.js to gate
  // which shortcuts apply while editing is in progress.
  const [editing, setEditing] = createSignal(false);

  // Clears any multi-selection without touching currentItem, mirroring
  // my-mind.js's clearMultiSelection() -- but item.js's unmarkSelected()
  // DOM calls have no counterpart here, since itemStateClassList() (see
  // below) already derives its display purely from these signals.
  function clearMultiSelection() {
    setSelectedItems(new Set());
    setSelectionCursor(null);
  }

  // Extends the multi-selection from the current selectionCursor (or
  // currentItem, if no cursor exists yet) to `item`, mirroring
  // my-mind.js's extendSelection() -- used by Shift+Arrow (see
  // newKeyboard.js's SelectAdd-equivalent command).
  function extendSelection(item) {
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
  // my-mind.js's selectItem(). Editing is not integrated here, so unlike
  // the old engine's version this never needs to finish an in-progress
  // edit before switching selection.
  function selectItem(item) {
    clearMultiSelection();
    setCurrentItem(item);
  }

  // Ctrl/Cmd+click toggle, mirroring my-mind.js's addToSelection(). Always
  // swaps in a fresh Set (see the comment on selectedItems above) rather
  // than mutating the current one in place.
  function addToSelection(item) {
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

  function isCurrent(item) {
    return currentItem() === item;
  }

  function isSelected(item) {
    return selectedItems().has(item);
  }

  // Small helper for JSX classList bindings (see NewMindMapPreview.jsx's
  // ItemNodeView), matching item.js's select()/markSelected() -- both of
  // which toggle "current"/"selected" classes on the item's own <g>
  // element (not its .content div), the classes map.css's selector rules
  // target (e.g. "[data-shape=box].item.current > foreignObject > .content").
  function itemStateClassList(item) {
    return {
      current: isCurrent(item),
      selected: isSelected(item),
    };
  }

  return {
    currentItem,
    setCurrentItem,
    selectedItems,
    setSelectedItems,
    selectionCursor,
    setSelectionCursor,
    editing,
    setEditing,
    clearMultiSelection,
    extendSelection,
    selectItem,
    addToSelection,
    isCurrent,
    isSelected,
    itemStateClassList,
  };
}
