import * as actions from "../action.js";
import * as app from "../my-mind.js";
let select = null;
const STATUS_MAP = {
  yes: true,
  no: false,
  "": null,
};
function statusToString(status) {
  for (let key in STATUS_MAP) {
    if (STATUS_MAP[key] === status) {
      return key;
    }
  }
  return String(status);
}
function stringToStatus(str) {
  return str in STATUS_MAP ? STATUS_MAP[str] : str;
}
export function init() {
  select = document.querySelector("#status");
  select.addEventListener("change", onChange);
}
export function dispose() {
  select.removeEventListener("change", onChange);
  select = null;
}
export function update() {
  select.value = statusToString(app.currentItem.status);
}
function onChange() {
  let status = stringToStatus(select.value);
  let action = new actions.SetStatus(app.currentItem, status);
  app.action(action);
  select.blur(); // return focus to the canvas so shortcuts keep working
}
