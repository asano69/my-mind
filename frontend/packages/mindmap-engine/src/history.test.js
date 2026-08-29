import { describe, it, expect } from "vitest";
import { createHistory } from "./history.js";

// Regression tests for history.js's push/back/forward/canBack/canForward.
// Originally planned for Phase 0 of the Solid migration (see CLAUDE.md),
// but this file accidentally duplicated action.test.js instead of testing
// history.js. Fixed here as part of Phase 7, which confirmed history.js's
// stack itself needs no changes now that Item's properties are
// signal-backed (Phase 6) — only what each Action's do()/undo() touches
// internally changed, not push()/back()/forward()'s mechanics.
//
// history.js has no module-level default singleton (see
// docs/mind-map-core-engine-library/01-plan.md's Step 5) -- this file
// builds its own instance via createHistory() and calls reset() before
// every test to start from an empty stack.

const history = createHistory();

function makeAction(name, log) {
  return {
    do() {
      log.push(`do:${name}`);
    },
    undo() {
      log.push(`undo:${name}`);
    },
  };
}

describe("history", () => {
  it("canBack/canForward are both false on an empty stack", () => {
    history.reset();
    expect(history.canBack()).toBe(false);
    expect(history.canForward()).toBe(false);
  });

  it("push() only records the action; it does not call do()", () => {
    // do() is the caller's responsibility (see my-mind.js's action()),
    // which calls action.do() itself before pushing onto the stack.
    history.reset();
    const log = [];
    history.push(makeAction("a", log));
    expect(log).toEqual([]);
    expect(history.canBack()).toBe(true);
    expect(history.canForward()).toBe(false);
  });

  it("back() undoes the most recently pushed action", () => {
    history.reset();
    const log = [];
    history.push(makeAction("a", log));
    history.push(makeAction("b", log));
    history.back();
    expect(log).toEqual(["undo:b"]);
    expect(history.canBack()).toBe(true);
    expect(history.canForward()).toBe(true);
  });

  it("forward() redoes the most recently undone action", () => {
    history.reset();
    const log = [];
    history.push(makeAction("a", log));
    history.back();
    history.forward();
    expect(log).toEqual(["undo:a", "do:a"]);
    expect(history.canBack()).toBe(true);
    expect(history.canForward()).toBe(false);
  });

  it("pushing after an undo discards the redo branch", () => {
    history.reset();
    const log = [];
    history.push(makeAction("a", log));
    history.push(makeAction("b", log));
    history.back(); // undo b
    history.push(makeAction("c", log));
    expect(history.canForward()).toBe(false);
    history.back();
    expect(log).toEqual(["undo:b", "undo:c"]);
  });
});
