import { describe, it, expect } from "vitest";
import { Multi } from "./action.js";

// Regression test for action.js's Multi action, added ahead of Phase 6/7 of
// the Solid migration (see CLAUDE.md), which will change how actions notify
// listeners. Characterizes today's do/undo ordering: do() runs sub-actions
// in the given order; undo() reverses them.
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

describe("action.Multi", () => {
  it("do() runs sub-actions in order", () => {
    const log = [];
    const multi = new Multi([
      makeAction("a", log),
      makeAction("b", log),
      makeAction("c", log),
    ]);
    multi.do();
    expect(log).toEqual(["do:a", "do:b", "do:c"]);
  });

  it("undo() reverses sub-actions in reverse order", () => {
    const log = [];
    const multi = new Multi([
      makeAction("a", log),
      makeAction("b", log),
      makeAction("c", log),
    ]);
    multi.do();
    log.length = 0;
    multi.undo();
    expect(log).toEqual(["undo:c", "undo:b", "undo:a"]);
  });
});
