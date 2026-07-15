import "../shape/box.js";
import "../shape/ellipse.js";
import "../shape/underline.js";
import * as actions from "../action.js";
import * as app from "../my-mind.js";
import { repo } from "../shape/shape.js";
let select = null;
export function init() {
  select = document.querySelector("#shape");
  repo.forEach((shape) => select.append(shape.option));
  select.addEventListener("change", onChange);
}
export function dispose() {
  select.removeEventListener("change", onChange);
  select = null;
}
export function update() {
  let value = "";
  let shape = app.currentItem.shape;
  if (shape) {
    value = shape.id;
  }
  select.value = value;
}
function onChange() {
  let shape = repo.get(select.value);
  let action = new actions.SetShape(app.currentItem, shape);
  app.action(action);
}
