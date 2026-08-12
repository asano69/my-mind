// newMouse.js — mouse interaction for the ?newEngine=1 preview.
//
// Phase 4.3 of docs/08-mindmap-engine-refactor.md: click-driven
// selection. Unlike the old engine's mouse.js (which delegates clicks at
// the `port` level and resolves the clicked item via getItemFor()), this
// is attached directly to each item's own content element in JSX -- see
// NewMindMapPreview.jsx's ItemNodeView -- which is the more natural
// Solid-idiomatic approach the plan calls for trying here.
//
// Drag-and-drop and hover tracking are deliberately not implemented yet
// (see Phase 4.7); this module covers plain click (select, Ctrl/Cmd+
// click toggles multi-selection) and double-click (starts text editing,
// added in Phase 4.5 -- see newEdit.js).
import { isCanvasActive } from "./scope.js";
import { selectItem, addToSelection, setEditing } from "./itemSelection.js";
import { startEditing } from "./newEdit.js";

export function handleItemClick(item, e) {
  if (!isCanvasActive()) {
    return;
  }
  if (e.ctrlKey || e.metaKey) {
    addToSelection(item);
  } else {
    selectItem(item);
  }
}

// Double-click starts live text editing, mirroring the old engine's
// mouse.js onDblClick -> commandRepo.get("edit").execute(). See
// newEdit.js for the actual contentEditable toggle.
export function handleItemDblClick(item, e) {
  if (!isCanvasActive()) {
    return;
  }
  if (startEditing(item)) {
    setEditing(true);
  }
}
