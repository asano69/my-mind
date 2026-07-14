// src/ui/context-menu.ts
import { repo as commandRepo } from "../command/command.js";
let node = document.querySelector("#context-menu");
let port;
export function init(port_) {
  port = port_;
  [...node.querySelectorAll("[data-command]")].forEach((button) => {
    let commandName = button.dataset.command;
    button.textContent = commandRepo.get(commandName).label;
  });
  port.addEventListener("mousedown", handleEvent);
  node.addEventListener("mousedown", handleEvent);
  close();
}
export function open(point) {
  node.hidden = false;
  let w = node.offsetWidth;
  let h = node.offsetHeight;
  let left = point[0];
  let top = point[1];
  if (left > port.offsetWidth / 2) {
    left -= w;
  }
  if (top > port.offsetHeight / 2) {
    top -= h;
  }
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
}
function handleEvent(e) {
  if (e.currentTarget != node) {
    close();
    return;
  }
  e.stopPropagation(); // no dragdrop, no blur of activeElement
  e.preventDefault(); // we do not want to focus the button
  let commandName = e.target.dataset.command;
  if (!commandName) {
    return;
  }
  let command = commandRepo.get(commandName);
  if (!command.isValid) {
    return;
  }
  command.execute();
  close();
}
function close() {
  node.hidden = true;
}
