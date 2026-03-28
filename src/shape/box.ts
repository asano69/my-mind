// box.ts
import Shape from "./shape.js";
import Item from "../item.js";
export default class Box extends Shape {
    constructor() { super("box", "Box"); }
    update(item: Item) {
        const raw = item.color;
        if (raw && raw !== '#ffffff') {
            item.dom.content.style.setProperty('--item-color', raw);
            item.dom.content.style.borderColor = ''; // CSS変数に委譲
        } else {
            item.dom.content.style.removeProperty('--item-color');
            item.dom.content.style.borderColor = item.resolvedColor; // 旧挙動を維持
        }
    }
}
new Box();
