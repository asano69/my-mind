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

// --- Stage 4.7.2 (see docs/08-phase4.7-drag-and-drop-refactor.md) ---
// domRefs-based rect resolution and ghost construction for drag-and-
// drop. Mirrors mouse.js's getContentRect()/buildGhost()/moveGhost()/
// visualizeDragState(), but sources DOM elements through the domRefs
// registry (see NewMindMapPreview.jsx's registerDomRef) instead of
// item.dom directly, since ItemNode (the Phase 1 data store, see
// itemStore.js) never holds a DOM reference of its own. None of this is
// wired to a real mouse event yet -- that lands in Stage 4.7.3, which
// also adds the elementFromPoint-based item lookup these functions will
// be driven by.

const SHADOW_OFFSET = 5;

// Resolves an item's rendered content-box rect via domRefs, falling
// back to its contentSize (with a 0,0 origin) when no element is
// registered yet -- mirrors mouse.js's getContentRect() fallback for
// the same "layout data exists before/without a live
// getBoundingClientRect" case.
export function getContentRectFor(domRefs, item) {
  const el = domRefs.get(item.id);
  if (el && typeof el.getBoundingClientRect === "function") {
    const rect = el.getBoundingClientRect();
    // DOMRect's fields are accessor properties on the prototype, not
    // own properties, so a shallow spread would silently drop them all
    // -- same fix mouse.js's own getContentRect() applies.
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }
  const [width = 0, height = 0] = item.contentSize || [];
  return { left: 0, top: 0, right: width, bottom: height, width, height };
}

// Builds a drag ghost from the first dragged item's content element,
// mirroring mouse.js's buildGhost(). Returns { ghost, position } (the
// initial [left, top], relative to port's own box, matching port's
// position:relative anchor -- see mouse.js's own comment on this), or
// null if the item has no registered DOM ref yet.
export function buildDragGhost(domRefs, port, items, cursorPoint) {
  const content = domRefs.get(items[0].id);
  if (!content || typeof content.cloneNode !== "function") {
    return null;
  }
  const ghost = content.cloneNode(true);
  ghost.classList.add("ghost");
  if (items.length > 1) {
    const badge = document.createElement("span");
    badge.className = "ghost-count";
    badge.textContent = String(items.length);
    ghost.appendChild(badge);
  }
  port.append(ghost);
  const portRect = port.getBoundingClientRect();
  const position = [
    cursorPoint[0] - portRect.left - (ghost.offsetWidth || 0) / 2,
    cursorPoint[1] - portRect.top - (ghost.offsetHeight || 0) / 2,
  ];
  return { ghost, position };
}

// Moves an already-built ghost by `delta`, mirroring mouse.js's
// moveGhost(). Mutates and returns `position` in place, matching the
// mutable current.ghostPosition array mouse.js keeps across moves.
export function moveDragGhost(ghost, position, delta) {
  position[0] += delta[0];
  position[1] += delta[1];
  ghost.style.left = `${position[0]}px`;
  ghost.style.top = `${position[1]}px`;
  return position;
}

// Applies (or clears) the drop-target highlight via domRefs, mirroring
// mouse.js's visualizeDragState(). `previousTarget` is cleared first
// (if given); pass `state: null` to only clear, matching mouse.js's own
// "state is null" clearing call.
export function visualizeNewDragState(domRefs, previousTarget, state) {
  if (previousTarget) {
    const el = domRefs.get(previousTarget.id);
    if (el) {
      el.style.boxShadow = "";
    }
  }
  if (!state) {
    return;
  }
  const el = domRefs.get(state.target.id);
  if (!el) {
    return;
  }
  let x = 0;
  let y = 0;
  if (state.result === "sibling") {
    if (state.direction === "left") x = -1;
    if (state.direction === "right") x = 1;
    if (state.direction === "top") y = -1;
    if (state.direction === "bottom") y = 1;
  }
  const spread = x || y ? -2 : 2;
  el.style.boxShadow = `${x * SHADOW_OFFSET}px ${y * SHADOW_OFFSET}px 2px ${spread}px #000`;
}

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
