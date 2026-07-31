// frontend/src/lib/dnd/DragDropRoot.jsx
import { DragDropProvider } from "@dnd-kit/solid";
import * as sortableTree from "../mindmap/dnd/sortableTree.js";

// DragDropRoot.jsx — unchanged, still correct:
function handleDragEnd(event) {
  if (event.operation.source?.data?.group != null) {
    sortableTree.handleDragEnd(event);
  }
}

// Phase 3 of the node-drag refactor (see docs/07-dnd-kit-solid-refactor.md):
// every non-root item (and root's own children) now has a
// useSortable/group binding (see sortableTree.js), so any drag whose
// source carries a `group` in its data came from our bindings and should
// be dispatched there.
export default function DragDropRoot(props) {
  function handleDragEnd(event) {
    if (event.operation.source?.data?.group != null) {
      sortableTree.handleDragEnd(event);
    }
  }

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      {props.children}
    </DragDropProvider>
  );
}
