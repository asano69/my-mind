import { describe, it, expect } from "vitest";
import { Multi, InsertNewItem } from "./action.js";

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

describe("action.InsertNewItem", () => {
  // Regression test for the undo-stack-pollution fix: creating a node
  // used to always construct its own Item and always get pushed to
  // history immediately (see command/command.js's old InsertSibling/
  // InsertChild), producing an extra "insert empty node" undo step even
  // when the node ended up with real content. command/edit.js's Finish
  // command now commits an already-inserted draft item as a single
  // history entry by passing that same item in here, instead of letting
  // this action construct a brand-new one.
  it("reuses a pre-built item instead of constructing a new one", () => {
    const draftItem = { isNew: true };
    const parent = {};
    const action = new InsertNewItem(parent, 2, draftItem);
    expect(action.item).toBe(draftItem);
    expect(action.parent).toBe(parent);
    expect(action.index).toBe(2);
  });
});
