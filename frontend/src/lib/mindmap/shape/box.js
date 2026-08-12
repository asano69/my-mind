// src/shape/box.ts
import Shape from "./shape.js";

// Pure: derives the box's own --item-color / border-color pair from the
// item's explicit and inherited color, without touching the DOM. update()
// below applies it directly to dom.content.style; NewMindMapPreview.jsx
// (the ?newEngine=1 preview, see docs/08-mindmap-engine-refactor.md's
// Phase 3.7) reads the same descriptor for its JSX style attribute
// instead of duplicating this branching.
export function computeBoxStyle(item) {
  const raw = item.color;
  const resolved = item.resolvedColor;
  if (raw && raw !== "#ffffff") {
    // explicit color set on this item
    return { itemColor: raw, borderColor: null };
  }
  if (resolved !== "#999" && resolved !== "#999999") {
    // inherited: no explicit color here, but an ancestor has one
    return { itemColor: resolved, borderColor: null };
  }
  // no color anywhere in the chain (default)
  return { itemColor: null, borderColor: resolved };
}

export default class Box extends Shape {
  constructor() {
    super("box", "Box");
  }
  update(item) {
    const { itemColor, borderColor } = computeBoxStyle(item);
    const style = item.dom.content.style;
    if (itemColor) {
      style.setProperty("--item-color", itemColor);
      style.borderColor = "";
    } else {
      style.removeProperty("--item-color");
      style.borderColor = borderColor;
    }
  }
}
new Box();
