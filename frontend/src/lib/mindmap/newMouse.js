// newMouse.js — mouse interaction for the ?newEngine=1 preview.
//
// Phase 4.3 of docs/08-mindmap-engine-refactor.md: click-driven
// selection only. Unlike the old engine's mouse.js (which delegates
// clicks at the `port` level and resolves the clicked item via
// getItemFor()), this is attached directly to each item's own content
// element in JSX -- see NewMindMapPreview.jsx's ItemNodeView -- which
// is the more natural Solid-idiomatic approach the plan calls for
// trying here.
//
// Double-click editing, drag-and-drop, and hover tracking are
// deliberately not implemented yet (see Phase 4.5/4.7); this module
// only covers what Phase 4.3 scopes in: plain click selects, Ctrl/Cmd+
// click toggles multi-selection.
import { isCanvasActive } from "./scope.js";
import { selectItem, addToSelection } from "./itemSelection.js";

export function handleItemClick(item, e) {
  // Ignore clicks while the canvas is backgrounded (Notes mode active),
  // same guard the old engine's mouse.js uses -- see scope.js.
  if (!isCanvasActive()) {
    return;
  }
  if (e.ctrlKey || e.metaKey) {
    addToSelection(item);
  } else {
    selectItem(item);
  }
}
