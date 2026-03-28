// box.ts
import Shape from "./shape.js";
import Item from "../item.js";
export default class Box extends Shape {
    constructor() { super("box", "Box"); }
      update(item: Item) {
          const raw = item.color;
          const resolved = item.resolvedColor;
          if (raw && raw !== '#ffffff') {
              // 明示的に色が設定されている
              item.dom.content.style.setProperty('--item-color', raw);
              item.dom.content.style.borderColor = '';
          } else if (resolved !== '#999' && resolved !== '#999999') {
              // 継承だが親に色がある
              item.dom.content.style.setProperty('--item-color', resolved);
              item.dom.content.style.borderColor = '';
          } else {
              // 色なし（デフォルト）
              item.dom.content.style.removeProperty('--item-color');
              item.dom.content.style.borderColor = resolved;
          }
      }

}
new Box();
