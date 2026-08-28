// src/shape/ellipse.ts
import Shape from "./shape.js";

// Pure: same idea as box.js's computeBoxStyle(), but ellipse never falls
// back to an inherited color for --item-color -- only an item's own
// explicit color sets it, matching this shape's original update().
export function computeEllipseStyle(item) {
  const raw = item.color;
  if (raw && raw !== "#ffffff") {
    return { itemColor: raw, borderColor: null };
  }
  return { itemColor: null, borderColor: item.resolvedColor };
}

export default class Ellipse extends Shape {
  constructor() {
    super("ellipse", "Ellipse");
  }
}
new Ellipse();
