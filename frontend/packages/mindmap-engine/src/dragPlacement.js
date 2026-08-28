// dragPlacement.js — pure, DOM-free append/sibling drop decision.
//
// Extracted from mouse.js's computeDragState() (Stage 4.7.1 of
// docs/08-phase4.7-drag-and-drop-refactor.md). The part of that function
// which decides "append vs sibling, and which side" never actually reads
// item.dom itself -- it only needs the target's already-resolved
// bounding rect, the point, and the tree structure (parent/isRoot,
// resolvedLayout.getChildDirection). Pulling it out here means the
// upcoming ?newEngine=1 drag-and-drop port (Stage 4.7.2 onward) can
// call the exact same function, sourcing targetRect via the domRefs
// registry instead of item.dom.content.getBoundingClientRect() --
// without duplicating (and risking drifting from) this decision logic.
//
// The algorithm itself is unchanged from mouse.js's own implementation,
// which in turn matches docs/07-drop-target-detection-refactor.md's
// shipped design: the append zone is exactly the target's own content
// rect; everything outside it is a sibling insertion, with direction
// decided by which side of the layout axis the cursor landed on.

// Rejects a drop onto the dragged item(s) themselves or any of their
// descendants, by walking up from `target` toward the root and checking
// whether any dragged item is encountered along the way.
export function isDraggedAncestor(target, draggedItems) {
  for (const draggedItem of draggedItems) {
    let tmp = target;
    while (!tmp.isRoot) {
      if (tmp === draggedItem) {
        return true;
      }
      tmp = tmp.parent;
    }
    if (tmp === draggedItem) {
      return true;
    } // root check
  }
  return false;
}

// Decides "append" vs "sibling" (and, for sibling, which direction) for
// a drag ending at `target`. `targetRect` may be null/undefined when
// `target.isRoot` is true, since the root case is decided before the
// rect is ever consulted (mirroring mouse.js's own short-circuit).
export function decideDropPlacement({
  point,
  target,
  targetRect,
  dx,
  dy,
  draggedItems,
}) {
  const state = { result: "", target, direction: "left" };
  if (isDraggedAncestor(target, draggedItems)) {
    return state;
  }
  if (target.isRoot) {
    state.result = "append";
    return state;
  }
  // The append zone is exactly the rectangle used to highlight a selected
  // node (target's content box). Anywhere inside it drops the dragged
  // item(s) as a child of target; outside it, insert as a sibling
  // before/after depending on which side of the layout axis the cursor
  // landed on.
  const insideContentRect =
    point[0] >= targetRect.left &&
    point[0] <= targetRect.right &&
    point[1] >= targetRect.top &&
    point[1] <= targetRect.bottom;
  if (insideContentRect) {
    state.result = "append";
    return state;
  }
  const childDirection = target.parent.resolvedLayout.getChildDirection(target);
  const isVerticalSiblings =
    childDirection == "left" || childDirection == "right";
  state.result = "sibling";
  state.direction = isVerticalSiblings
    ? dy < 0
      ? "bottom"
      : "top"
    : dx < 0
      ? "right"
      : "left";
  return state;
}
