// src/shape/underline.ts
import Shape from "./shape.js";
const VERTICAL_OFFSET = -4;

// Pure: computes the underline's own vertical anchor and path descriptor
// ({ d, stroke }), without touching the DOM -- mirrors the connector
// descriptor shape layout/*.js's computeXxxLayout() functions already
// return (see docs/08-mindmap-engine-refactor.md's Phase 3.1-3.3).
// update() below writes it to a real SVG <path>; NewMindMapPreview.jsx
// reads the same descriptor for its own <path> element instead of
// duplicating this math.
export function getUnderlineVerticalAnchor(item) {
  const { contentPosition, contentSize } = item;
  return contentPosition[1] + contentSize[1] + VERTICAL_OFFSET + 0.5;
}

export function computeUnderlinePath(item) {
  const { contentPosition, resolvedColor, contentSize } = item;
  const left = contentPosition[0];
  const right = left + contentSize[0];
  const top = getUnderlineVerticalAnchor(item);
  return {
    d: [`M ${left} ${top}`, `L ${right} ${top}`].join(" "),
    stroke: resolvedColor,
  };
}

export default class Underline extends Shape {
  constructor() {
    super("underline", "Underline");
  }
  getVerticalAnchor(item) {
    return getUnderlineVerticalAnchor(item);
  }
}
new Underline();
