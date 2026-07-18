import { repo as commandRepo } from "../command/command.js";
let node = null;
let port = null;

// Assumes a single instance in the DOM (see
// docs/workspace-mode-switch-refactor.md, Phase 4) — `#context-menu`
// is looked up by id. Safe under the current "one canvas, toggle
// visibility" model; revisit if multiple canvases are ever mounted
// simultaneously.
export function init(port_) {
  node = document.querySelector("#context-menu");
  port = port_;
  [...node.querySelectorAll("[data-command]")].forEach((button) => {
    let commandName = button.dataset.command;
    button.textContent = commandRepo.get(commandName).label;
  });
  port.addEventListener("mousedown", handleEvent);
  node.addEventListener("mousedown", handleEvent);
  close();
}
export function dispose() {
  port.removeEventListener("mousedown", handleEvent);
  node.removeEventListener("mousedown", handleEvent);
  node = null;
  port = null;
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
