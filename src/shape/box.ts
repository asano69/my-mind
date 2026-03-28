// box.ts
import Shape from "./shape.js";
import Item from "../item.js";
export default class Box extends Shape {
    constructor() { super("box", "Box"); }
    update(item: Item) {
        item.dom.content.style.setProperty('--item-color', item.resolvedColor);
        item.dom.content.style.borderColor = ''; // CSS変数に委譲
    }
}
new Box();
