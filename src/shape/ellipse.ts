// ellipse.ts（同様）
import Shape from "./shape.js";
import Item from "../item.js";
export default class Ellipse extends Shape {
    constructor() { super("ellipse", "Ellipse"); }
    update(item: Item) {
        item.dom.content.style.setProperty('--item-color', item.resolvedColor);
        item.dom.content.style.borderColor = '';
    }
}
new Ellipse();
