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

export function init(node_, initialPosition = [0, 0]) {
  node = node_;
  position = initialPosition;
  zoomScale = 1;
  node.style.transformOrigin = "0 0";
}

export function dispose() {
  node = null;
  position = [0, 0];
  zoomScale = 1;
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
