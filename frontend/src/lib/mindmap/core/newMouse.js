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
import {
  currentItem,
  selectedItems,
  selectItem,
  addToSelection,
  editing,
  setEditing,
} from "./itemSelection.js";
import { startEditing, commitEditing } from "./newEdit.js";
import { action, MoveItem, Multi } from "./newAction.js";
import { decideDropPlacement, isDraggedAncestor } from "./dragPlacement.js";
import { isSameOrigin } from "./urlUtils.js";
import { navigateTo } from "../navigation.js";
import * as viewport from "./newViewport.js";

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

// --- Stage 4.7.3 (see docs/08-phase4.7-drag-and-drop-refactor.md) ---
// Event wiring, elementFromPoint-based reverse lookup, and
// newAction.js integration. Node drag-and-drop only -- panning and
// touch are out of scope here (the new engine has no pan command yet,
// and mouse.js's touch branches are intentionally not ported in this
// pass; see docs/07-drop-target-detection-refactor.md's own Non-goals
// for the same scoping choice).

const DROP_TARGET_STICKY_PADDING = 24;

function isPointInExpandedRect(rect, point, padding) {
  return (
    point[0] >= rect.left - padding &&
    point[0] <= rect.right + padding &&
    point[1] >= rect.top - padding &&
    point[1] <= rect.bottom + padding
  );
}

// Resolves the ItemNode whose registered content element (see
// registerDomRef) matches `element` (or an ancestor of it), mirroring
// mouse.js's getItemFor(). `root` is walked recursively rather than
// relying on any tree-wide index, matching map.js's own getItemFor().
export function getItemForElement(root, domRefs, element) {
  const content = element?.closest?.(".content");
  if (!content || !root) {
    return null;
  }
  function scan(item) {
    if (domRefs.get(item.id) === content) {
      return item;
    }
    for (const child of item.childItems) {
      const found = scan(child);
      if (found) {
        return found;
      }
    }
    return null;
  }
  return scan(root);
}

// Distance-ranked fallback used when the pointer isn't directly over any
// registered element, mirroring map.js's getClosestItem().
export function getClosestItemFor(root, domRefs, point) {
  const all = [];
  function scan(item) {
    const rect = getContentRectFor(domRefs, item);
    const dx = rect.left + rect.width / 2 - point[0];
    const dy = rect.top + rect.height / 2 - point[1];
    all.push({ item, dx, dy, distance: dx * dx + dy * dy });
    if (!item.collapsed) {
      item.childItems.forEach(scan);
    }
  }
  scan(root);
  all.sort((a, b) => a.distance - b.distance);
  return all[0];
}

function collisionForItem(domRefs, item, point) {
  const rect = getContentRectFor(domRefs, item);
  return {
    item,
    dx: rect.left + rect.width / 2 - point[0],
    dy: rect.top + rect.height / 2 - point[1],
  };
}

// Mirrors mouse.js's getStableDropCollision(): whatever the pointer is
// directly over always wins; the previous target is only kept via
// hysteresis when there is no direct hit, to avoid flicker in gaps
// between nodes.
export function getStableDropCollisionFor(
  root,
  domRefs,
  point,
  previousTarget,
) {
  const element = globalThis.document?.elementFromPoint?.(point[0], point[1]);
  const directTarget = getItemForElement(root, domRefs, element);
  if (directTarget) {
    return collisionForItem(domRefs, directTarget, point);
  }
  if (previousTarget) {
    const rect = getContentRectFor(domRefs, previousTarget);
    if (isPointInExpandedRect(rect, point, DROP_TARGET_STICKY_PADDING)) {
      return collisionForItem(domRefs, previousTarget, point);
    }
  }
  return getClosestItemFor(root, domRefs, point);
}

// Resolves the drop target via getStableDropCollisionFor(), then
// delegates the append/sibling decision to dragPlacement.js's
// decideDropPlacement() -- the same shared function mouse.js's own
// computeDragState() now calls (see Stage 4.7.1).
export function computeNewDragState(
  root,
  domRefs,
  cursor,
  draggedItems,
  previousTarget,
) {
  const closest = getStableDropCollisionFor(
    root,
    domRefs,
    cursor,
    previousTarget,
  );
  const target = closest.item;
  const targetRect = target.isRoot ? null : getContentRectFor(domRefs, target);
  return decideDropPlacement({
    point: cursor,
    target,
    targetRect,
    dx: closest.dx,
    dy: closest.dy,
    draggedItems,
  });
}

// Builds and dispatches the MoveItem/Multi action for a completed drag,
// mirroring mouse.js's finishDragDrop(). Routed through newAction.js's
// action() (Phase 4.6), so the move becomes a real undo/redo step.
export function finishNewDragDrop(state, items) {
  const { target, result, direction } = state;
  if (isDraggedAncestor(target, items)) {
    return;
  }
  const subactions = [];
  for (const item of items) {
    if (result === "append") {
      subactions.push(new MoveItem(item, target));
    } else if (result === "sibling") {
      const parent = target.parent;
      let index = parent.childItems.indexOf(target);
      // `index` above is computed against the *pre-move* children array
      // (the dragged item is still sitting in it at this point). If the
      // dragged item is a sibling of `target` and currently sits before
      // it, insertChild()'s internal removeChild() will shift `target`
      // (and everything after it) one slot earlier once the item is
      // pulled out -- so this raw index must be adjusted here, or a
      // forward reorder consistently lands one slot past where the user
      // dropped it. Moves across different parents, or backward moves
      // (item already after target), need no adjustment.
      if (item.parent === parent && parent.childItems.indexOf(item) < index) {
        index -= 1;
      }
      const targetIndex =
        index + (direction === "right" || direction === "bottom" ? 1 : 0);
      subactions.push(new MoveItem(item, parent, targetIndex, target.side));
    } else {
      return;
    }
  }
  if (subactions.length === 0) {
    return;
  }
  action(subactions.length === 1 ? subactions[0] : new Multi(subactions));
}

// All currently selected items (currentItem plus any multi-selection),
// mirroring my-mind.js's getAllSelected().
function getAllSelectedItems() {
  const all = [currentItem()];
  selectedItems().forEach((item) => all.push(item));
  return all;
}

let current = {
  mode: "",
  cursor: [],
  items: [],
  ghost: null,
  ghostPosition: [],
  ctrlHeld: false,
  previousDragState: null,
  suppressNextClick: false,
};
let port = null;
let container = null;
let domRefsRef = null;
let getRootFn = null;

// Registers node-drag listeners on `port_` (the SVG root element).
// `getRoot` is a function returning the currently loaded root ItemNode
// (or null/undefined before it has loaded), since the tree can change
// out from under a long-lived listener (e.g. switching maps).
export function init(domRefs, port_, container_, getRoot) {
  domRefsRef = domRefs;
  port = port_;
  container = container_;
  getRootFn = getRoot;
  port.addEventListener("mousedown", onDragStart);
  port.addEventListener("click", onClick);
  port.addEventListener("wheel", onWheel);
}

// Called on unmount. Removes every listener registered by init(),
// force-ends any drag in progress, and resets module state -- mirrors
// mouse.js's own dispose().
export function dispose() {
  if (port) {
    port.removeEventListener("mousedown", onDragStart);
    port.removeEventListener("mousemove", onDragMove);
    port.removeEventListener("mouseup", onDragEnd);
    port.removeEventListener("click", onClick);
    port.removeEventListener("wheel", onWheel);
  }
  if (current.ghost) {
    current.ghost.remove();
  }
  current = {
    mode: "",
    cursor: [],
    items: [],
    ghost: null,
    ghostPosition: [],
    ctrlHeld: false,
    previousDragState: null,
    suppressNextClick: false,
  };
  port = null;
  container = null;
  domRefsRef = null;
  getRootFn = null;
}

function onClick(e) {
  if (current.suppressNextClick) {
    current.suppressNextClick = false;
    e.preventDefault?.();
  }
}

// Mirrors mouse.js's onWheel(): zooms around the wheel cursor position.
function onWheel(e) {
  if (!isCanvasActive()) {
    return;
  }
  const { deltaY } = e;
  if (!deltaY) {
    return;
  }
  e.preventDefault();
  const dir = deltaY > 0 ? -1 : 1;
  viewport.adjustZoom(dir, [e.clientX, e.clientY]);
}

function eventToPoint(e) {
  return [e.clientX, e.clientY];
}

function onDragStart(e) {
  if (!isCanvasActive()) {
    return;
  }
  const root = getRootFn?.();
  if (!root) {
    return;
  }
  const item = getItemForElement(root, domRefsRef, e.target);
  if (editing()) {
    const editedItem = currentItem();
    if (item === editedItem) {
      return; // ignore dnd on the item currently being edited
    }
    // Clicked elsewhere while editing: finalize the edit first, same as
    // mouse.js's onDragStart calling commandRepo.get("finish").execute().
    commitEditing(editedItem);
    setEditing(false);
  }
  // Move focus back into the canvas so subsequent keyboard shortcuts
  // reach newKeyboard.js's scoped listener, mirroring mouse.js's own
  // container.focus() call here.
  container?.focus();
  current.cursor = eventToPoint(e);
  if (item && !item.isRoot) {
    current.mode = "drag";
    const isSelected = item === currentItem() || selectedItems().has(item);
    if (isSelected) {
      current.items = getAllSelectedItems().filter((i) => i && !i.isRoot);
    } else {
      // Selection itself is deferred to the first real move (see
      // onDragMove) so a plain click's Ctrl+click multi-selection isn't
      // clobbered before the click event has a chance to run -- same
      // reasoning as mouse.js's own onDragStart.
      current.items = [item];
      current.ctrlHeld = e.ctrlKey || e.metaKey;
    }
  } else {
    // No item under the pointer (or the root itself, which never
    // participates in drag-and-drop) -- pan the viewport instead,
    // mirroring mouse.js's own else-branch.
    current.mode = "pan";
    port.style.cursor = "move";
  }
  e.preventDefault();
  port.addEventListener("mousemove", onDragMove);
  port.addEventListener("mouseup", onDragEnd);
}

function onDragMove(e) {
  const point = eventToPoint(e);
  const delta = [point[0] - current.cursor[0], point[1] - current.cursor[1]];
  current.cursor = point;
  if (current.mode === "pan") {
    e.preventDefault();
    viewport.moveBy(delta);
    return;
  }
  if (current.mode !== "drag") {
    return;
  }
  e.preventDefault();
  if (!current.ghost) {
    const draggedItem = current.items[0];
    if (
      !current.ctrlHeld &&
      current.items.length === 1 &&
      draggedItem !== currentItem() &&
      !selectedItems().has(draggedItem)
    ) {
      selectItem(draggedItem);
    }
    const built = buildDragGhost(
      domRefsRef,
      port,
      current.items,
      current.cursor,
    );
    if (!built) {
      return;
    }
    current.ghost = built.ghost;
    current.ghostPosition = built.position;
  } else {
    moveDragGhost(current.ghost, current.ghostPosition, delta);
  }
  const root = getRootFn?.();
  if (!root) {
    return;
  }
  const previousTarget = current.previousDragState?.target ?? null;
  const state = computeNewDragState(
    root,
    domRefsRef,
    current.cursor,
    current.items,
    previousTarget,
  );
  visualizeNewDragState(
    domRefsRef,
    previousTarget,
    state.result ? state : null,
  );
  current.previousDragState = state.result ? state : null;
}

function onDragEnd(_e) {
  port.style.cursor = "";
  port.removeEventListener("mousemove", onDragMove);
  port.removeEventListener("mouseup", onDragEnd);
  const { mode, ghost, previousDragState } = current;
  if (mode === "pan") {
    current.mode = "";
    return;
  }
  if (mode !== "drag") {
    current.mode = "";
    return;
  }
  if (ghost) {
    const root = getRootFn?.();
    if (root) {
      const state = computeNewDragState(
        root,
        domRefsRef,
        current.cursor,
        current.items,
        previousDragState?.target ?? null,
      );
      finishNewDragDrop(state, current.items);
    }
    visualizeNewDragState(domRefsRef, previousDragState?.target ?? null, null);
    ghost.remove();
    current.ghost = null;
    // A browser-dispatched click after mouseup would otherwise move
    // selection/focus to whatever node is under the pointer at the drop
    // position -- suppress just that synthetic post-drag click, same as
    // mouse.js's own current.suppressNextClick.
    current.suppressNextClick = true;
  }
  current.items = [];
  current.mode = "";
  current.previousDragState = null;
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
export function handleItemDblClick(item, _e) {
  if (!isCanvasActive()) {
    return;
  }
  if (startEditing(item)) {
    setEditing(true);
  }
}

// Opens an item's link (see itemStore.js's `url` field), mirroring the
// old engine's item.js dom.link click handler -- same-origin links use
// the shared navigation.js bridge for a client-side transition, external
// links open in a new tab. Unlike item.js's version (an imperative
// addEventListener call inside a vanilla constructor), this is wired as
// a plain JSX onClick prop (see NewMindMapPreview.jsx's ItemNodeView).
// Deliberately does not stop propagation: the click still bubbles up to
// the item's own onClick (handleItemClick above), so clicking the link
// icon both opens the link and selects the node, matching item.js's own
// spec.
export function handleItemLinkClick(item) {
  if (!isCanvasActive()) {
    return;
  }
  const url = item.url;
  if (!url) {
    return;
  }
  if (isSameOrigin(url)) {
    const target = new URL(url, window.location.href);
    if (!navigateTo(target.pathname + target.search + target.hash)) {
      window.location.href = url;
    }
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// Selects the right-clicked item and cancels any in-progress drag,
// mirroring the old engine's mouse.js handleContextMenu(). Kobalte's
// ContextMenu.Trigger (see MindMapCanvas.jsx) owns opening/positioning
// the menu itself; this only handles the item-selection/drag-cancel
// side effect the engine needs regardless of how the menu opens.
export function handleContextMenu(e) {
  if (!isCanvasActive()) {
    return;
  }
  const root = getRootFn?.();
  if (!root) {
    return;
  }
  onDragEnd(e);
  const item = getItemForElement(root, domRefsRef, e.target);
  if (item) {
    selectItem(item);
  }
}
