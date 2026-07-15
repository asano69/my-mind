// src/shape/ellipse.ts
// ellipse.ts（同様）
import Shape from "./shape.js";
export default class Ellipse extends Shape {
  constructor() {
    super("ellipse", "Ellipse");
  }
  update(item) {
    const raw = item.color;
    if (raw && raw !== "#ffffff") {
      item.dom.content.style.setProperty("--item-color", raw);
      item.dom.content.style.borderColor = "";
    } else {
      item.dom.content.style.removeProperty("--item-color");
      item.dom.content.style.borderColor = item.resolvedColor;
    }
  }
}
new Ellipse();
