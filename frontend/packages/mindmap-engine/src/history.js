import { createSignal } from "solid-js";

// createHistory() — one independent undo stack per instance, per
// docs/mind-map-core-engine-library/01-plan.md's Step 5. reset() must be
// called on every teardown (see MindMapCanvas.jsx's onCleanup), so a
// subsequent mount starts with an empty undo stack instead of inheriting
// the previous map's history.
export function createHistory() {
  let index = 0; // points to the last undoed action
  let actions = [];

  // Bumped on every stack mutation (push/back/forward/reset). canBack()/
  // canForward() themselves stay plain functions reading the closed-over
  // array -- nothing about the *stack contents* needs to be reactive
  // data, only "did the stack change" does. This mirrors store.js's
  // dirtyVersion pattern: consumers (see command/command.js's Undo/Redo
  // isValid) read historyVersion() purely to establish a Solid
  // dependency, then call the plain functions to get the actual answer.
  const [historyVersion, setHistoryVersion] = createSignal(0);
  function bumpHistoryVersion() {
    setHistoryVersion((v) => v + 1);
  }

  function reset() {
    index = 0;
    actions = [];
    bumpHistoryVersion();
  }
  function push(action) {
    if (index < actions.length) {
      // remove undoed actions
      actions.splice(index, actions.length - index);
    }
    actions.push(action);
    index++;
    bumpHistoryVersion();
  }
  function back() {
    actions[--index].undo();
    bumpHistoryVersion();
  }
  function forward() {
    actions[index++].do();
    bumpHistoryVersion();
  }
  function canBack() {
    return !!index;
  }
  function canForward() {
    return index != actions.length;
  }

  return { historyVersion, reset, push, back, forward, canBack, canForward };
}
