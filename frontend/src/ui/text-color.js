// src/ui/text-color.ts
import * as actions from "../action.js";
import * as app from "../my-mind.js";
const node = document.querySelector("#text-color");
export function init() {
    node.addEventListener("click", onClick);
    [...node.querySelectorAll("[data-color]")].forEach(item => {
        item.style.backgroundColor = item.dataset.color;
    });
}
function onClick(e) {
    e.preventDefault();
    let color = e.target.dataset.color || "";
    let action = new actions.SetTextColor(app.currentItem, color);
    app.action(action);
}
