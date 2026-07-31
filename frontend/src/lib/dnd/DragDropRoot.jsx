// frontend/src/lib/dnd/DragDropRoot.jsx
import { DragDropProvider } from "@dnd-kit/solid";
import * as sortableRoot from "../mindmap/dnd/sortableRoot.js";

// Phase 2 of the node-drag refactor (see docs/07-dnd-kit-solid-refactor.md):
// dispatches to sortableRoot.js's handleDragEnd only for drags belonging
// to its single fixed group (the root's direct children). Every other
// node in the tree has no sortable/droppable bindings yet, so dragging
// them is still handled entirely by mouse.js, unaffected by this
// provider.
export default function DragDropRoot(props) {
  function handleDragEnd(event) {
    if (event.operation.source?.data?.group === sortableRoot.GROUP) {
      sortableRoot.handleDragEnd(event);
    }
  }

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      {props.children}
    </DragDropProvider>
  );
}
