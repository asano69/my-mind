// src/ui/color.ts
import * as actions from "../action.js";
import * as app from "../my-mind.js";
const node = document.querySelector("#color");
export function init() {
    node.addEventListener("click", onClick);
    [...node.querySelectorAll("[data-color]")].forEach(item => {
        item.style.backgroundColor = item.dataset.color;
    });
}
function onClick(e) {
    e.preventDefault();
    let color = e.target.dataset.color || "";
    let action = new actions.SetColor(app.currentItem, color);
    app.action(action);
}
