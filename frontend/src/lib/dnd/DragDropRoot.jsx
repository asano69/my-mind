// frontend/src/lib/dnd/DragDropRoot.jsx
import { DragDropProvider } from "@dnd-kit/solid";

// Phase 1 of the node-drag refactor (see docs/07-dnd-kit-solid-refactor.md):
// wraps the canvas in a DragDropProvider so later phases can add
// useSortable/useDroppable hooks incrementally, one at a time. No
// sortable/droppable hooks are registered yet, so mounting this provider
// has no effect on current drag behavior -- mouse.js's own
// mousedown/touchstart-based dragging (see mouse.js) still handles every
// node move, pan, and pinch-zoom exactly as before.
//
// onDragEnd is intentionally a no-op for now. It will start dispatching
// actions.MoveItem (see action.js) once Phase 2 introduces the first
// useSortable-based list.
export default function DragDropRoot(props) {
  function handleDragEnd(_event) {
    // no-op in Phase 1
  }

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      {props.children}
    </DragDropProvider>
  );
}
