import * as menu from "./ui/context-menu.js";
import * as app from "./my-mind.js";
import * as actions from "./action.js";
import { repo as commandRepo } from "./command/command.js";
import { isCanvasActive } from "./scope.js";

const TOUCH_DELAY = 500;
const SHADOW_OFFSET = 5;
// Minimum change in pinch distance (px) required to trigger one zoom step
const PINCH_THRESHOLD = 30;
let touchContextTimeout;
let current = {
  mode: "",
  cursor: [],
  items: [],
  ghost: null,
  ghostPosition: [],
  grabOffset: [0, 0],
  ctrlHeld: false,
  previousDragState: null,
  pinchDistance: 0,
};
let port;
let container;
export function init(port_, container_) {
  port = port_;
  container = container_;
  port.addEventListener("touchstart", onDragStart);
  port.addEventListener("mousedown", onDragStart);
  port.addEventListener("click", onClick);
  port.addEventListener("dblclick", onDblClick);
  port.addEventListener("wheel", onWheel);
  port.addEventListener("contextmenu", onContextMenu);
}
// Called by my-mind.js's unmount(). Removes every listener registered by
// init(), force-ends any drag in progress (so an orphaned ghost element
// does not survive the unmount), and resets all module state.
export function dispose() {
  clearTimeout(touchContextTimeout);
  if (current.ghost) {
    current.ghost.remove();
  }
  port.removeEventListener("touchstart", onDragStart);
  port.removeEventListener("mousedown", onDragStart);
  port.removeEventListener("click", onClick);
  port.removeEventListener("dblclick", onDblClick);
  port.removeEventListener("wheel", onWheel);
  port.removeEventListener("contextmenu", onContextMenu);
  port.removeEventListener("mousemove", onDragMove);
  port.removeEventListener("mouseup", onDragEnd);
  port.removeEventListener("touchmove", onDragMove);
  port.removeEventListener("touchend", onDragEnd);
  port.style.cursor = "";
  current = {
    mode: "",
    cursor: [],
    items: [],
    ghost: null,
    ghostPosition: [],
    grabOffset: [0, 0],
    ctrlHeld: false,
    previousDragState: null,
    pinchDistance: 0,
  };
  port = null;
  container = null;
}
function onClick(e) {
  if (!isCanvasActive() || !app.currentMap) {
    return;
  }

  const me = e;
  let item = app.currentMap.getItemFor(e.target);
  if (app.editing && item == app.currentItem) {
    return;
  } // ignore on edited node
  if (!item) {
    return;
  }
  // Ctrl/Cmd+click toggles multi-selection; plain click replaces it
  if (me.ctrlKey || me.metaKey) {
    app.addToSelection(item);
  } else {
    app.selectItem(item);
  }
}
function onDblClick(e) {
  if (!isCanvasActive() || !app.currentMap) {
    return;
  }

  let item = app.currentMap.getItemFor(e.target);
  item && commandRepo.get("edit").execute();
}

function onWheel(e) {
  if (!isCanvasActive() || !app.currentMap) {
    return;
  }

  const { deltaY } = e;
  if (!deltaY) {
    return;
  }
  e.preventDefault();
  let dir = deltaY > 0 ? -1 : 1;
  app.currentMap.adjustZoom(dir, [e.clientX, e.clientY]);
}
function onContextMenu(e) {
  if (!isCanvasActive() || !app.currentMap) {
    return;
  }

  onDragEnd(e);
  e.preventDefault();
  let item = app.currentMap.getItemFor(e.target);
  item && app.selectItem(item);
  menu.open([e.clientX, e.clientY]);
}
function onDragStart(e) {
  if (!isCanvasActive() || !app.currentMap) {
    return;
  }
  if (e.type == "touchstart" && "touches" in e && e.touches.length == 2) {
    // Two fingers down: enter pinch mode
    clearTimeout(touchContextTimeout);
    current.mode = "pinch";
    current.pinchDistance = getTouchDistance(e.touches);
    e.preventDefault();
    return;
  }
  let point = eventToPoint(e);
  if (!point) {
    return;
  }
  let item = app.currentMap.getItemFor(e.target);
  if (app.editing) {
    if (item == app.currentItem) {
      return;
    } // ignore dnd on edited node
    commandRepo.get("finish").execute(); // clicked elsewhere => finalize edit
  }
  // Move focus back into the mind map route so future scoped keyboard
  // listeners can receive shortcuts after mouse interactions.
  container.focus();
  // we can safely start drag
  current.cursor = point;
  if (item && !item.isRoot) {
    current.mode = "drag";
    // If the grabbed item is part of the current selection, drag all selected non-root items.
    // Otherwise drag only the grabbed item (and switch the selection to it).
    const isSelected = item === app.currentItem || app.selectedItems.has(item);
    if (isSelected) {
      current.items = app.getAllSelected().filter((i) => !i.isRoot);
    } else {
      // Item is not in the current selection. Do NOT call selectItem here
      // (mousedown) because that would clear any Ctrl+click multi-selection
      // before the click event has a chance to run. Selection is updated
      // in onDragMove once we know a real drag is happening.
      current.items = [item];
      current.ctrlHeld = e.ctrlKey || e.metaKey;
    }
  } else {
    current.mode = "pan";
    port.style.cursor = "move";
  }
  if (e.type == "mousedown") {
    // to prevent blurring the clipboard node
    // also, no selection allowed
    // only for mouse - preventing touchstart would prevent Safari from emulating clicks
    e.preventDefault();
    port.addEventListener("mousemove", onDragMove);
    port.addEventListener("mouseup", onDragEnd);
  }
  if (e.type == "touchstart") {
    // context menu here, after we have the item
    touchContextTimeout = setTimeout(function () {
      item && app.selectItem(item);
      menu.open(point);
    }, TOUCH_DELAY);
    port.addEventListener("touchmove", onDragMove);
    port.addEventListener("touchend", onDragEnd);
  }
}
function onDragMove(e) {
  if ("touches" in e && e.touches.length == 2) {
    handlePinch(e);
    return;
  }
  let point = eventToPoint(e);
  if (!point) {
    return;
  }
  clearTimeout(touchContextTimeout);
  e.preventDefault();
  let delta = [point[0] - current.cursor[0], point[1] - current.cursor[1]];
  current.cursor = point;
  switch (current.mode) {
    case "drag":
      if (!current.ghost) {
        port.style.cursor = "move";
        // If dragging a single item that was not already selected, select it
        // now (drag confirmed). Doing this at mousedown would clear any
        // Ctrl+click multi-selection before the click event could fire.
        const draggedItem = current.items[0];
        if (
          !current.ctrlHeld &&
          current.items.length === 1 &&
          draggedItem !== app.currentItem &&
          !app.selectedItems.has(draggedItem)
        ) {
          app.selectItem(draggedItem);
        }
        buildGhost(current.items[0], current.items.length);
      }
      moveGhost(delta);
      let state = computeDragState();
      visualizeDragState(state);
      break;
    case "pan":
      app.currentMap.moveBy(delta);
      break;
  }
}
function onDragEnd(_e) {
  clearTimeout(touchContextTimeout);
  port.style.cursor = "";
  port.removeEventListener("mousemove", onDragMove);
  port.removeEventListener("mouseup", onDragEnd);
  const { mode, ghost } = current;
  if (mode == "pan" || mode == "pinch") {
    current.mode = ""; // otherwise isDragging() would stay stuck on a stale mode
    return;
  } // no cleanup after panning or pinching
  if (ghost) {
    let state = computeDragState();
    finishDragDrop(state);
    ghost.remove();
    current.ghost = null;
  }
  current.items = [];
  current.mode = "";
}

// Whether a node drag is currently in progress (mousedown/touchstart on a
// non-root item started a drag session that hasn't ended yet). Used by
// edit.js's Cancel command so pressing Escape mid-drag cancels it instead
// of closing panels.
export function isDragging() {
  return current.mode === "drag";
}

// Cancels an in-progress node drag without committing any move, restoring
// the map to its pre-drag state. Called by edit.js's Cancel command.
export function cancelDrag() {
  if (current.mode !== "drag") {
    return;
  }
  clearTimeout(touchContextTimeout);
  port.removeEventListener("mousemove", onDragMove);
  port.removeEventListener("mouseup", onDragEnd);
  port.removeEventListener("touchmove", onDragMove);
  port.removeEventListener("touchend", onDragEnd);
  port.style.cursor = "";
  visualizeDragState(null);
  if (current.ghost) {
    current.ghost.remove();
  }
  current.mode = "";
  current.ghost = null;
  current.items = [];
  current.ghostPosition = [];
  current.ctrlHeld = false;
  current.previousDragState = null;
}
/**
 * Handle a two-finger pinch gesture to zoom in or out.
 * Triggers one zoom step per PINCH_THRESHOLD pixels of distance change.
 */
function handlePinch(e) {
  if (!app.currentMap) {
    return;
  }
  e.preventDefault();
  clearTimeout(touchContextTimeout);
  const dist = getTouchDistance(e.touches);
  // If we weren't already in pinch mode, just record the baseline distance
  if (current.mode !== "pinch") {
    current.mode = "pinch";
    current.pinchDistance = dist;
    return;
  }
  const delta = dist - current.pinchDistance;
  if (Math.abs(delta) >= PINCH_THRESHOLD) {
    const anchorPoint = [
      (e.touches[0].clientX + e.touches[1].clientX) / 2,
      (e.touches[0].clientY + e.touches[1].clientY) / 2,
    ];
    app.currentMap.adjustZoom(delta > 0 ? 1 : -1, anchorPoint);
    current.pinchDistance = dist; // reset baseline after each step
  }
}
function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}
/**
 * Build a drag ghost from the first dragged item's content node.
 * When multiple items are dragged, a badge showing the count is overlaid.
 */
function buildGhost(item, count) {
  const { content } = item.dom;
  let ghost = content.cloneNode(true);
  ghost.classList.add("ghost");
  // Show a count badge so the user knows multiple items are moving
  if (count > 1) {
    let badge = document.createElement("span");
    badge.className = "ghost-count";
    badge.textContent = String(count);
    ghost.appendChild(badge);
  }
  port.append(ghost);
  current.ghost = ghost;
  // The ghost is `position: absolute`, and port (<main>) is its
  // positioned ancestor (`position: relative` in my-mind.css). So the
  // ghost's left/top are relative to port's own box, not to the
  // viewport. current.cursor holds viewport coordinates (clientX/clientY),
  // so port's own offset (e.g. the left panel's width, via main's
  // margin-left) must be subtracted here, or the ghost renders shifted
  // away from the actual cursor position.
  const portRect = port.getBoundingClientRect();
  // Center the ghost on the cursor so dragging feels natural regardless of
  // where within the node the user clicked.
  current.ghostPosition = [
    current.cursor[0] - portRect.left - ghost.offsetWidth / 2,
    current.cursor[1] - portRect.top - ghost.offsetHeight / 2,
  ];
}
function moveGhost(delta) {
  let { ghostPosition } = current;
  let ghost = current.ghost;
  ghostPosition[0] += delta[0];
  ghostPosition[1] += delta[1];
  ghost.style.left = `${ghostPosition[0]}px`;
  ghost.style.top = `${ghostPosition[1]}px`;
}
function finishDragDrop(state) {
  visualizeDragState(null);
  const { target, result, direction } = state;
  // Build one MoveItem action per dragged item, then wrap in Multi if needed
  const subactions = [];
  for (const item of current.items) {
    switch (result) {
      case "append":
        subactions.push(new actions.MoveItem(item, target));
        break;
      case "sibling":
        {
          let targetChildItem = target;
          let index = targetChildItem.parent.children.indexOf(targetChildItem);
          let targetIndex =
            index + (direction == "right" || direction == "bottom" ? 1 : 0);
          subactions.push(
            new actions.MoveItem(
              item,
              targetChildItem.parent,
              targetIndex,
              targetChildItem.side,
            ),
          );
        }
        break;
      default:
        return;
    }
  }
  if (subactions.length === 0) {
    return;
  }
  app.action(
    subactions.length === 1 ? subactions[0] : new actions.Multi(subactions),
  );
}
/**
 * Compute a state object for a drag: current result (""/"append"/"sibling"), parent/sibling, direction.
 * Returns result="" if the drop target is a dragged item itself or one of its descendants.
 */
function computeDragState() {
  if (!app.currentMap) {
    return { result: "", target: null, direction: "left" };
  }
  // Use the cursor position for hit-testing, not the ghost center.
  // The ghost can be grabbed anywhere, so its center drifts away from
  // the cursor; the cursor is always the authoritative "drop here" point.
  let point = current.cursor;
  let closest = app.currentMap.getClosestItem(point);
  let target = closest.item;
  let state = {
    result: "",
    target,
    direction: "left",
  };
  // Reject drop if target is inside any of the dragged subtrees
  for (const draggedItem of current.items) {
    let tmp = target;
    while (!tmp.isRoot) {
      if (tmp === draggedItem) {
        return state;
      }
      tmp = tmp.parent;
    }
    if (tmp === draggedItem) {
      return state;
    } // root check
  }
  // Use the first dragged item's content size for proximity calculation
  let itemContentSize = current.items[0].contentSize;
  let targetContentSize = target.contentSize;
  const w = Math.max(itemContentSize[0], targetContentSize[0]);
  const h = Math.max(itemContentSize[1], targetContentSize[1]);
  if (target.isRoot) {
    // append here
    state.result = "append";
  } else if (Math.abs(closest.dx) < w && Math.abs(closest.dy) < h) {
    // append here
    state.result = "append";
  } else {
    state.result = "sibling";
    let childDirection = target.parent.resolvedLayout.getChildDirection(target);
    if (childDirection == "left" || childDirection == "right") {
      state.direction = closest.dy < 0 ? "bottom" : "top";
    } else {
      state.direction = closest.dx < 0 ? "right" : "left";
    }
  }
  return state;
}
function visualizeDragState(state) {
  let { previousDragState } = current;
  if (
    previousDragState &&
    state &&
    previousDragState.target == state.target &&
    previousDragState.result == state.result
  ) {
    return;
  } // nothing changed
  if (previousDragState?.target) {
    // remove old vis
    previousDragState.target.dom.content.style.boxShadow = "";
  }
  if (!state) {
    return;
  }
  // show new vis
  let x = 0,
    y = 0;
  if (state.result == "sibling") {
    if (state.direction == "left") {
      x = -1;
    }
    if (state.direction == "right") {
      x = +1;
    }
    if (state.direction == "top") {
      y = -1;
    }
    if (state.direction == "bottom") {
      y = +1;
    }
  }
  let spread = x || y ? -2 : 2;
  state.target.dom.content.style.boxShadow = `${x * SHADOW_OFFSET}px ${y * SHADOW_OFFSET}px 2px ${spread}px #000`;
  current.previousDragState = state;
}
function eventToPoint(e) {
  if ("touches" in e) {
    if (e.touches.length > 1) {
      return null;
    }
    return [e.touches[0].clientX, e.touches[0].clientY];
  } else {
    return [e.clientX, e.clientY];
  }
}
