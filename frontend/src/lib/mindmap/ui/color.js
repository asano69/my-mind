import * as actions from "../action.js";
import * as app from "../my-mind.js";
let node = null;
export function init() {
  node = document.querySelector("#color");
  node.addEventListener("click", onClick);
  [...node.querySelectorAll("[data-color]")].forEach((item) => {
    item.style.backgroundColor = item.dataset.color;
  });
}
export function dispose() {
  node.removeEventListener("click", onClick);
  node = null;
}
function onClick(e) {
  e.preventDefault();
  let color = e.target.dataset.color || "";
  let action = new actions.SetColor(app.currentItem, color);
  app.action(action);
}
