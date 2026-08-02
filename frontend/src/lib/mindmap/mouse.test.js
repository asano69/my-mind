import { describe, expect, it, vi, beforeEach } from "vitest";

const menuOpen = vi.fn();
const finishExecute = vi.fn();
const getCommand = vi.fn((id) =>
  id === "finish" ? { execute: finishExecute } : {},
);
const getItemFor = vi.fn();
const getClosestItem = vi.fn();
const adjustZoom = vi.fn();
const selectItem = vi.fn();
const actionFn = vi.fn();

vi.mock("./ui/context-menu.js", () => ({ open: menuOpen }));
vi.mock("./command/command.js", () => ({ repo: { get: getCommand } }));
vi.mock("./action.js", () => ({
  MoveItem: class MoveItem {
    constructor(item, target, targetIndex, side) {
      this.item = item;
      this.target = target;
      this.targetIndex = targetIndex;
      this.side = side;
    }
  },
  Multi: class Multi {
    constructor(actions) {
      this.actions = actions;
    }
  },
}));

// mockActiveMode: mutable holder so individual tests can flip it, per
// docs/workspace-mode-switch-refactor.md's Phase 3 guard. Must be
// declared before the vi.mock("./store.js", ...) call below references it.
const { mockActiveMode } = vi.hoisted(() => ({
  mockActiveMode: { value: "canvas" },
}));
vi.mock("./store.js", () => ({ activeMode: () => mockActiveMode.value }));

vi.mock("./my-mind.js", () => ({
  get currentMap() {
    return { getItemFor, getClosestItem, adjustZoom };
  },
  get currentItem() {
    return null;
  },
  get editing() {
    return false;
  },
  selectedItems: new Set(),
  addToSelection: vi.fn(),
  selectItem,
  action: actionFn,
  getAllSelected: vi.fn(() => []),
}));

const mouse = await import("./mouse.js");

function contentNode(attrs = {}) {
  return {
    ...attrs,
    style: {},
    classList: { add: vi.fn() },
    appendChild: vi.fn(),
    cloneNode: vi.fn(() => contentNode({ offsetWidth: 60, offsetHeight: 30 })),
    remove: vi.fn(),
  };
}

function eventTarget() {
  const listeners = new Map();
  return {
    style: {},
    addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type) => listeners.delete(type)),
    dispatch(type, event) {
      listeners.get(type)?.(event);
    },
  };
}

describe("mouse focus handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getItemFor.mockReturnValue(null);
    getClosestItem.mockReset();
    selectItem.mockClear();
    actionFn.mockClear();
    mockActiveMode.value = "canvas";
    delete globalThis.document;
  });

  it("focuses the scoped container when a drag starts", () => {
    const port = eventTarget();
    const container = { focus: vi.fn() };
    mouse.init(port, container);
    port.dispatch("mousedown", {
      type: "mousedown",
      target: {},
      clientX: 10,
      clientY: 20,
      preventDefault: vi.fn(),
    });

    expect(container.focus).toHaveBeenCalledOnce();

    mouse.dispose();
  });
  it("ignores mousedown while the canvas is backgrounded", () => {
    const port = eventTarget();
    const container = { focus: vi.fn() };
    mouse.init(port, container);
    mockActiveMode.value = "notes";

    port.dispatch("mousedown", {
      type: "mousedown",
      target: {},
      clientX: 10,
      clientY: 20,
      preventDefault: vi.fn(),
    });

    expect(container.focus).not.toHaveBeenCalled();

    mouse.dispose();
  });

  it("zooms around the wheel cursor position", () => {
    const port = eventTarget();
    const container = { focus: vi.fn() };
    const preventDefault = vi.fn();
    mouse.init(port, container);

    port.dispatch("wheel", {
      deltaY: -100,
      clientX: 123,
      clientY: 456,
      preventDefault,
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(adjustZoom).toHaveBeenCalledWith(1, [123, 456]);

    mouse.dispose();
  });

  it("uses the node directly under the pointer as the drop target", () => {
    const dragged = {
      isRoot: false,
      contentSize: [60, 30],
      dom: {
        content: contentNode({ offsetWidth: 60, offsetHeight: 30 }),
      },
    };
    const directTarget = {
      isRoot: true,
      contentSize: [80, 40],
      dom: {
        content: contentNode({
          getBoundingClientRect: () => ({
            left: 100,
            top: 100,
            width: 80,
            height: 40,
            right: 180,
            bottom: 140,
          }),
        }),
      },
    };
    const centerTarget = {
      isRoot: true,
      contentSize: [40, 20],
      dom: { content: contentNode() },
    };
    const directElement = { closest: vi.fn() };
    globalThis.document = {
      elementFromPoint: vi.fn(() => directElement),
    };
    getItemFor.mockImplementation((element) =>
      element === directElement ? directTarget : dragged,
    );
    getClosestItem.mockReturnValue({ item: centerTarget, dx: 0, dy: 0 });

    const port = eventTarget();
    port.append = vi.fn();
    port.getBoundingClientRect = () => ({ left: 0, top: 0 });
    const container = { focus: vi.fn() };
    mouse.init(port, container);

    port.dispatch("mousedown", {
      type: "mousedown",
      target: dragged.dom.content,
      clientX: 10,
      clientY: 20,
      preventDefault: vi.fn(),
    });
    port.dispatch("mousemove", {
      target: dragged.dom.content,
      clientX: 120,
      clientY: 120,
      preventDefault: vi.fn(),
    });
    port.dispatch("mouseup", { target: directTarget.dom.content });

    expect(globalThis.document.elementFromPoint).toHaveBeenCalledWith(120, 120);
    expect(actionFn.mock.calls[0][0].target).toBe(directTarget);

    mouse.dispose();
  });

  it("does not let the post-drag click move selection to the drop target", () => {
    const dragged = {
      isRoot: false,
      contentSize: [60, 30],
      dom: {
        content: contentNode({ offsetWidth: 60, offsetHeight: 30 }),
      },
    };
    const target = {
      isRoot: true,
      contentSize: [80, 40],
      dom: { content: contentNode() },
    };
    getItemFor.mockImplementation((element) =>
      element?.dataset?.role === "drop-target" ? target : dragged,
    );
    getClosestItem.mockReturnValue({ item: target, dx: 0, dy: 0 });

    const port = eventTarget();
    port.append = vi.fn();
    port.getBoundingClientRect = () => ({ left: 0, top: 0 });
    const container = { focus: vi.fn() };
    mouse.init(port, container);

    port.dispatch("mousedown", {
      type: "mousedown",
      target: dragged.dom.content,
      clientX: 10,
      clientY: 20,
      preventDefault: vi.fn(),
    });
    port.dispatch("mousemove", {
      target: dragged.dom.content,
      clientX: 30,
      clientY: 40,
      preventDefault: vi.fn(),
    });
    port.dispatch("mouseup", { target: target.dom.content });

    const preventDefault = vi.fn();
    const clickTarget = { dataset: { role: "drop-target" } };
    port.dispatch("click", { target: clickTarget, preventDefault });

    expect(actionFn).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(selectItem).toHaveBeenCalledOnce();
    expect(selectItem).toHaveBeenCalledWith(dragged);

    mouse.dispose();
  });
});

// Phase 0 of docs/07-drop-target-detection-refactor.md: characterization
// tests for computeDragState()'s current append/sibling boundary. No
// production code changes here -- these tests document today's behavior
// (and its threshold) so Phase 2's axis-margin rewrite can be compared
// against a known baseline. Unlike the tests above (which exercise
// *target selection* via elementFromPoint/getClosestItem), these drive
// getClosestItem directly with explicit dx/dy so the append-vs-sibling
// arithmetic itself can be pinned down.
// Builds a minimal 3-level tree (root -> middle -> target) so the
// ancestor walk in computeDragState() (which rejects drops onto a
// dragged item's own subtree) has somewhere to terminate. Shared by both
// the Phase 0 and Phase 1 describe blocks below.
function buildThreeLevelTree({ targetContentSize, draggedContentSize }) {
  const root = { isRoot: true };
  const middle = {
    isRoot: false,
    parent: root,
    resolvedLayout: { getChildDirection: vi.fn(() => "right") },
  };
  const target = {
    isRoot: false,
    parent: middle,
    side: "right",
    contentSize: targetContentSize,
    dom: { content: contentNode() },
  };
  middle.children = [target];
  const dragged = {
    isRoot: false,
    contentSize: draggedContentSize,
    dom: {
      content: contentNode({
        offsetWidth: draggedContentSize[0],
        offsetHeight: draggedContentSize[1],
      }),
    },
  };
  return { root, middle, target, dragged };
}

// Drives a full mousedown -> mousemove -> mouseup drag sequence with
// getClosestItem pinned to (target, dx, dy), then returns the
// MoveItem-like object passed to app.action() so the caller can tell
// append (targetIndex undefined) from sibling (targetIndex a number)
// apart -- see action.js's MoveItem mock constructor above. Shared by
// both the Phase 0 and Phase 1 describe blocks below.
function dragTo(dragged, target, dx, dy) {
  getItemFor.mockImplementation((element) =>
    element === dragged.dom.content ? dragged : target,
  );
  getClosestItem.mockReturnValue({ item: target, dx, dy, distance: 0 });

  const port = eventTarget();
  port.append = vi.fn();
  port.getBoundingClientRect = () => ({ left: 0, top: 0 });
  const container = { focus: vi.fn() };
  mouse.init(port, container);

  port.dispatch("mousedown", {
    type: "mousedown",
    target: dragged.dom.content,
    clientX: 0,
    clientY: 0,
    preventDefault: vi.fn(),
  });

  // Move to the actual coordinates that sit dx,dy away from target's
  // center (targetContentSize/2). This keeps mouseup's own recomputation
  // (sticky collision) consistent with the mocked dx/dy values.
  const [tw, th] = target.contentSize;
  port.dispatch("mousemove", {
    target: dragged.dom.content,
    clientX: tw / 2 - dx,
    clientY: th / 2 - dy,
    preventDefault: vi.fn(),
  });
  port.dispatch("mouseup", { target: target.dom.content });
  mouse.dispose();
  return actionFn.mock.calls[0]?.[0];
}

describe("computeDragState append/sibling threshold (Phase 0 characterization, see docs/07-drop-target-detection-refactor.md)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete globalThis.document;
  });

  it("today's append/sibling boundary sits exactly at the larger of the two nodes' own size (w = max(itemW, targetW), h = max(itemH, targetH))", () => {
    const { target, dragged } = buildThreeLevelTree({
      targetContentSize: [80, 40],
      draggedContentSize: [60, 30],
    });
    // h = max(30, 40) = 40 per the current formula in mouse.js's
    // computeDragState(); w = max(60, 80) = 80 (not exercised by this
    // vertical-offset case, since dx stays 0 throughout).

    const justInsideAppend = dragTo(dragged, target, 0, 39);
    expect(justInsideAppend.targetIndex).toBeUndefined(); // append: MoveItem(item, target)

    actionFn.mockClear();

    const justOutsideAppend = dragTo(dragged, target, 0, 41);
    expect(typeof justOutsideAppend.targetIndex).toBe("number"); // sibling: MoveItem(item, parent, index, side)
  });

  it("still registers append well outside the target's own visual bounds, since both axes share one full-node-size threshold today", () => {
    // A single-line node is typically much shorter than it is wide. With
    // today's symmetric w/h formula, a cursor sitting further from center
    // than half the node's own rendered height can still land on
    // "append" as long as it stays within one *full* node-height of the
    // center. This is exactly the generous-but-imprecise behavior Phase 2
    // is meant to replace with a narrow margin along the sibling-ordering
    // axis only (see the doc's "採用設計" section).
    const { target, dragged } = buildThreeLevelTree({
      targetContentSize: [200, 24],
      draggedContentSize: [200, 24],
    });

    // 20px below center: well outside the node's own ~12px half-height,
    // yet still inside today's h=24 append threshold.
    const result = dragTo(dragged, target, 0, 20);
    expect(result.targetIndex).toBeUndefined();
  });
});

// Phase 1 of docs/07-drop-target-detection-refactor.md: regression tests
// for the axis-margin append/sibling design planned for Phase 2, written
// before that implementation exists (per CLAUDE.md's "write a failing
// test before fixing" rule). The new design applies the append/sibling
// boundary along the sibling-ordering axis using the *target's own* axis
// size (not max(item, target)) minus an edge margin -- see the doc's
// "採用設計" section:
//   edgeMargin(axisSize) = max(axisSize * 0.2, 10)
//   new append boundary  = axisSize / 2 - edgeMargin(axisSize)
// For a same-sized 100x100 item/target pair with childDirection "right"
// (sibling axis is vertical, i.e. dy), axisSize = 100, margin = 20, so
// the new append boundary sits at 50 - 20 = 30.
describe("computeDragState axis-margin design (Phase 1 characterization, see docs/07-drop-target-detection-refactor.md)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete globalThis.document;
  });

  it("40% of the way from center to the target's own edge (dy=20) is append under both the new design and today's implementation", () => {
    const { target, dragged } = buildThreeLevelTree({
      targetContentSize: [100, 100],
      draggedContentSize: [100, 100],
    });
    // New design: 20 < 30 (new append boundary) -> append.
    // Today: h = max(100, 100) = 100; 20 < 100 -> append too.
    // This passes already -- kept as a regression guard so Phase 2 does
    // not accidentally shrink the append zone below this point.
    const result = dragTo(dragged, target, 0, 20);
    expect(result.targetIndex).toBeUndefined(); // append
  });

  it("90% of the way from center to the target's own edge (dy=45) should be sibling under the new design, but today's implementation still returns append", () => {
    const { target, dragged } = buildThreeLevelTree({
      targetContentSize: [100, 100],
      draggedContentSize: [100, 100],
    });
    // New design: 45 >= 30 (new append boundary) -> sibling.
    // Today: h = max(100, 100) = 100; 45 < 100 -> append, so this
    // assertion currently FAILS. This is the intentionally-failing
    // regression test Phase 2's axis-margin rewrite must turn green.
    const result = dragTo(dragged, target, 0, 45);
    expect(typeof result.targetIndex).toBe("number"); // sibling
  });
});
