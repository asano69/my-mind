// newViewport.js — pan/zoom viewport for the ?newEngine=1 preview.
//
// Mirrors map.js's position/zoomScale state and moveBy()/moveTo()/
// adjustZoom() logic unchanged -- only the owner differs: map.js keeps
// this state on a Map instance, this module keeps it as plain module
// state operating on whatever SVG node init() is given (NewMindMapPreview.jsx's
// own <svg> ref plays the same role map.js's `this.node` does for the
// old engine).
const DEFAULT_FONT_SIZE = 15;
const MIN_ZOOM_SCALE = 8 / DEFAULT_FONT_SIZE;
const ZOOM_STEP = 2 / DEFAULT_FONT_SIZE;

let node = null;
let position = [0, 0];
let zoomScale = 1;
// Root's own on-screen anchor across layout passes, mirroring map.js's
// `_lastRootContentPosition` -- see anchorRootPosition() below.
let lastRootContentPosition = null;

// Bridge for the "center map" command (see command/command.js's Center
// for the old engine, newContextMenuCommands.js for the new one).
// NewMindMapPreview.jsx registers accessors for the current root's size
// and the container's on-screen size at mount time -- same "owning
// component registers, vanilla module reads" pattern as
// navigation.js's registerNavigate()/notes.js's registerEditorAPI() --
// since this module has no reference to the ItemNode tree or the
// container element on its own.
let getRootSize = null;
let getContainerSize = null;

export function registerCenterSource(getRootSizeFn, getContainerSizeFn) {
  getRootSize = getRootSizeFn;
  getContainerSize = getContainerSizeFn;
}

// Re-centers the currently registered root inside its container,
// mirroring map.js's Map.prototype.center() for the old engine. A
// no-op if nothing is registered yet (e.g. called before the preview
// has mounted) or the root hasn't laid out yet.
export function recenter() {
  if (!getRootSize || !getContainerSize) {
    return;
  }
  const rootSize = getRootSize();
  const containerSize = getContainerSize();
  if (!rootSize || !containerSize) {
    return;
  }
  center(rootSize, containerSize);
}

export function init(node_, initialPosition = [0, 0]) {
  node = node_;
  position = initialPosition;
  zoomScale = 1;
  node.style.transformOrigin = "0 0";
  resetAnchor();
}

export function dispose() {
  node = null;
  position = [0, 0];
  zoomScale = 1;
  resetAnchor();
  getRootSize = null;
  getContainerSize = null;
}

// Clears the anchor baseline, so the next anchorRootPosition() call
// treats its argument as a fresh starting point instead of comparing it
// against a stale position left over from a previous map/root.
export function resetAnchor() {
  lastRootContentPosition = null;
}

function moveTo(point) {
  position = point;
  node.style.left = `${point[0]}px`;
  node.style.top = `${point[1]}px`;
}

export function moveBy(diff) {
  if (!node) {
    return;
  }
  moveTo(position.map((p, i) => p + diff[i]));
}

// Centers `contentSize` (typically the root item's own overall
// [width, height], see ItemNode.size in itemStore.js) inside a viewport
// of `containerSize`, mirroring map.js's Map.prototype.center().
export function center(contentSize, containerSize) {
  if (!node) {
    return;
  }
  moveTo(
    [
      (containerSize[0] - contentSize[0]) / 2,
      (containerSize[1] - contentSize[1]) / 2,
    ].map(Math.round),
  );
}

// Keeps the root node visually anchored to the same screen point across
// layout recomputes, mirroring map.js's own _anchorRootPosition(). The
// root's own contentPosition shifts whenever a branch's bounding box
// changes size (e.g. after a collapse, a drag-and-drop move, or a text
// edit), which would otherwise shift the *whole* map on screen even
// though only the affected branch actually changed -- this compensates
// by moving the viewport by the opposite delta, so only the branches
// appear to move.
export function anchorRootPosition(rootContentPosition) {
  if (!node) {
    return;
  }
  if (lastRootContentPosition) {
    const dx = rootContentPosition[0] - lastRootContentPosition[0];
    const dy = rootContentPosition[1] - lastRootContentPosition[1];
    if (dx || dy) {
      // contentPosition lives inside the node that carries the zoom
      // `transform: scale()`, while moveBy()'s left/top offsets sit
      // outside that transform (see adjustZoom()'s own anchor math), so
      // the compensation must be scaled by zoomScale to line up on
      // screen.
      moveBy([-dx * zoomScale, -dy * zoomScale]);
    }
  }
  lastRootContentPosition = rootContentPosition;
}

// anchorPoint defaults to the node's own center when omitted. Unlike
// map.js's adjustZoom() (which defaults to the current item's content
// box), the new engine has no such default wired up yet -- callers that
// care about a precise anchor (e.g. wheel-zoom) always pass an explicit
// cursor-based anchorPoint anyway.
export function adjustZoom(diff, anchorPoint) {
  if (!node) {
    return;
  }
  const previousScale = zoomScale;
  const nextScale = Math.max(MIN_ZOOM_SCALE, previousScale + ZOOM_STEP * diff);
  if (nextScale === previousScale) {
    return;
  }

  const before = node.getBoundingClientRect();
  const resolvedAnchor = anchorPoint ?? [
    before.left + before.width / 2,
    before.top + before.height / 2,
  ];
  const unscaledAnchorOffset = [
    (resolvedAnchor[0] - before.left) / previousScale,
    (resolvedAnchor[1] - before.top) / previousScale,
  ];

  zoomScale = nextScale;
  node.style.transform = `scale(${zoomScale})`;

  const after = node.getBoundingClientRect();
  moveBy([
    resolvedAnchor[0] - (after.left + unscaledAnchorOffset[0] * nextScale),
    resolvedAnchor[1] - (after.top + unscaledAnchorOffset[1] * nextScale),
  ]);
}
