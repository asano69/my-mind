import { createSignal } from "solid-js";

// reset() must be called by my-mind.js's unmount() on every teardown, so a
// subsequent mount() starts with an empty undo stack instead of inheriting
// the previous map's history.
let index = 0; // points to the last undoed action
let actions = [];

// Bumped on every stack mutation (push/back/forward/reset). canBack()/
// canForward() themselves stay plain functions reading the module-level
// array -- nothing about the *stack contents* needs to be reactive data,
// only "did the stack change" does. This mirrors store.js's dirtyVersion
// pattern: consumers (see command/command.js's Undo/Redo isValid) read
// historyVersion() purely to establish a Solid dependency, then call the
// plain functions to get the actual answer.
const [historyVersion, setHistoryVersion] = createSignal(0);
export { historyVersion };
function bumpHistoryVersion() {
  setHistoryVersion((v) => v + 1);
}

export function reset() {
  index = 0;
  actions = [];
  bumpHistoryVersion();
}
export function push(action) {
  if (index < actions.length) {
    // remove undoed actions
    actions.splice(index, actions.length - index);
  }
  actions.push(action);
  index++;
  bumpHistoryVersion();
}
export function back() {
  actions[--index].undo();
  bumpHistoryVersion();
}
export function forward() {
  actions[index++].do();
  bumpHistoryVersion();
}
export function canBack() {
  return !!index;
}
export function canForward() {
  return index != actions.length;
}
