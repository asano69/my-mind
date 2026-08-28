import { describe, expect, it } from "vitest";
import { decideDropPlacement, isDraggedAncestor } from "./dragPlacement.js";

// Stage 4.7.1 of docs/08-phase4.7-drag-and-drop-refactor.md: regression
// tests for the DOM-free append/sibling decision extracted out of
// mouse.js's computeDragState(). Uses plain object stubs for items
// (parent/isRoot/resolvedLayout), matching the style of
// layout/pure-layout.test.js -- no DOM, no map.js.

function item({ isRoot = false, parent = null, resolvedLayout } = {}) {
  return { isRoot, parent, resolvedLayout };
}

describe("isDraggedAncestor", () => {
  it("rejects a target that is itself a dragged item", () => {
    const root = item({ isRoot: true });
    const dragged = item({ parent: root });
    expect(isDraggedAncestor(dragged, [dragged])).toBe(true);
  });

  it("rejects a target that is a descendant of a dragged item", () => {
    const root = item({ isRoot: true });
    const dragged = item({ parent: root });
    const grandchild = item({ parent: dragged });
    expect(isDraggedAncestor(grandchild, [dragged])).toBe(true);
  });

  it("allows an unrelated target", () => {
    const root = item({ isRoot: true });
    const dragged = item({ parent: root });
    const other = item({ parent: root });
    expect(isDraggedAncestor(other, [dragged])).toBe(false);
  });
});

describe("decideDropPlacement", () => {
  it("rejects a drop onto a dragged item's own subtree", () => {
    const root = item({ isRoot: true });
    const dragged = item({ parent: root });

    const state = decideDropPlacement({
      point: [0, 0],
      target: dragged,
      targetRect: { left: -10, right: 10, top: -10, bottom: 10 },
      dx: 0,
      dy: 0,
      draggedItems: [dragged],
    });

    expect(state.result).toBe("");
  });

  it("always appends when the target is root", () => {
    const root = item({ isRoot: true });

    const state = decideDropPlacement({
      point: [500, 500],
      target: root,
      targetRect: null,
      dx: 0,
      dy: 0,
      draggedItems: [],
    });

    expect(state.result).toBe("append");
  });

  it("appends when the point is inside the target's content rect", () => {
    const root = item({ isRoot: true });
    const target = item({ parent: root });

    const state = decideDropPlacement({
      point: [5, 5],
      target,
      targetRect: { left: 0, right: 10, top: 0, bottom: 10 },
      dx: 0,
      dy: 3,
      draggedItems: [],
    });

    expect(state.result).toBe("append");
  });

  it("becomes a vertical sibling (top/bottom) when outside the rect on a left/right layout axis", () => {
    // resolvedLayout lives on the PARENT, not target itself --
    // decideDropPlacement() reads target.parent.resolvedLayout, mirroring
    // mouse.js's original computeDragState() (the parent's layout decides
    // how its children are arranged/sibling-ordered).
    const root = item({
      isRoot: true,
      resolvedLayout: { getChildDirection: () => "right" },
    });
    const target = item({ parent: root });

    const below = decideDropPlacement({
      point: [5, 50],
      target,
      targetRect: { left: 0, right: 10, top: 0, bottom: 10 },
      dx: 0,
      dy: -5, // negative dy => cursor is below target's center
      draggedItems: [],
    });
    expect(below).toMatchObject({ result: "sibling", direction: "bottom" });

    const above = decideDropPlacement({
      point: [5, -50],
      target,
      targetRect: { left: 0, right: 10, top: 0, bottom: 10 },
      dx: 0,
      dy: 5,
      draggedItems: [],
    });
    expect(above).toMatchObject({ result: "sibling", direction: "top" });
  });

  it("becomes a horizontal sibling (left/right) when outside the rect on a top/bottom layout axis", () => {
    const root = item({
      isRoot: true,
      resolvedLayout: { getChildDirection: () => "bottom" },
    });
    const target = item({ parent: root });

    const rightSide = decideDropPlacement({
      point: [50, 5],
      target,
      targetRect: { left: 0, right: 10, top: 0, bottom: 10 },
      dx: -5, // negative dx => cursor is to the right of target's center
      dy: 0,
      draggedItems: [],
    });
    expect(rightSide).toMatchObject({ result: "sibling", direction: "right" });

    const leftSide = decideDropPlacement({
      point: [-50, 5],
      target,
      targetRect: { left: 0, right: 10, top: 0, bottom: 10 },
      dx: 5,
      dy: 0,
      draggedItems: [],
    });
    expect(leftSide).toMatchObject({ result: "sibling", direction: "left" });
  });
});
