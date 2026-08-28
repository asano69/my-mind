import { describe, expect, it, vi, beforeEach } from "vitest";

// scope.js no longer imports store.js (see docs/mind-map-core-engine-library.md,
// Step 2) -- isCanvasActive() now reads scope.js's own baseScope signal
// directly, so mockActiveMode.value is a thin proxy over setBaseScope()
// instead of a store.js mock. Every existing `mockActiveMode.value = ...`
// line below is unchanged; only what it plumbs into differs.
import * as scope from "./scope.js";
const mockActiveMode = {
  set value(v) {
    scope.setBaseScope(v);
  },
};
vi.mock("./newEdit.js", () => ({
  startEditing: vi.fn(() => ({})),
  commitEditing: vi.fn(),
}));
vi.mock("./urlUtils.js", () => ({ isSameOrigin: vi.fn(() => false) }));
vi.mock("./navigation.js", () => ({ navigateTo: vi.fn(() => false) }));

// newAction.js is mocked the same way mouse.test.js mocks action.js:
// MoveItem/Multi just record their constructor args, and action() is a
// spy, so finishNewDragDrop()'s dispatch can be asserted without
// exercising real tree mutation/history side effects.
vi.mock("./newAction.js", () => ({
  action: vi.fn(),
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

const {
  handleItemClick,
  handleItemDblClick,
  handleItemLinkClick,
  getContentRectFor,
  buildDragGhost,
  moveDragGhost,
  visualizeNewDragState,
  getItemForElement,
  getStableDropCollisionFor,
  finishNewDragDrop,
  init: initMouse,
  dispose: disposeMouse,
} = await import("./newMouse.js");
const { isSameOrigin } = await import("./urlUtils.js");
const { navigateTo } = await import("./navigation.js");
const {
  currentItem,
  setCurrentItem,
  selectedItems,
  setSelectedItems,
  editing,
  setEditing,
} = await import("./itemSelection.js");
const { startEditing, commitEditing } = await import("./newEdit.js");
const { action: actionFn, MoveItem, Multi } = await import("./newAction.js");
function resetSelectionState() {
  setCurrentItem(null);
  setSelectedItems(new Set());
  setEditing(false);
}

describe("newMouse.js handleItemClick (Phase 4.3)", () => {
  beforeEach(() => {
    mockActiveMode.value = "canvas";
    resetSelectionState();
  });

  it("selects the clicked item on a plain click", () => {
    const item = { id: "a" };
    handleItemClick(item, {});

    expect(currentItem()).toBe(item);
  });

  it("Ctrl+click adds to the multi-selection instead of replacing currentItem", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    setCurrentItem(a);

    handleItemClick(b, { ctrlKey: true });

    expect(currentItem()).toBe(a);
    expect(selectedItems().has(b)).toBe(true);
  });

  it("Cmd (metaKey)+click also adds to the multi-selection", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    setCurrentItem(a);

    handleItemClick(b, { metaKey: true });

    expect(selectedItems().has(b)).toBe(true);
  });

  it("ignores clicks while the canvas is backgrounded", () => {
    mockActiveMode.value = "notes";
    const item = { id: "a" };

    handleItemClick(item, {});

    expect(currentItem()).toBeNull();
  });
});

describe("newMouse.js handleItemDblClick (Phase 4.5)", () => {
  beforeEach(() => {
    mockActiveMode.value = "canvas";
    resetSelectionState();
    vi.clearAllMocks();
  });

  it("starts editing on double-click", () => {
    const item = { id: "a" };
    handleItemDblClick(item, {});

    expect(startEditing).toHaveBeenCalledWith(item);
    expect(editing()).toBe(true);
  });

  it("does not enter editing mode if startEditing() finds no DOM ref", () => {
    startEditing.mockReturnValueOnce(null);
    const item = { id: "a" };
    handleItemDblClick(item, {});

    expect(editing()).toBe(false);
  });

  it("ignores double-clicks while the canvas is backgrounded", () => {
    mockActiveMode.value = "notes";
    const item = { id: "a" };
    handleItemDblClick(item, {});

    expect(startEditing).not.toHaveBeenCalled();
  });
});

// Stage 4.7.2 of docs/08-phase4.7-drag-and-drop-refactor.md: domRefs-
// based rect/ghost/highlight helpers. No real mouse events yet -- these
// are exercised directly against DOM-free stubs, matching mouse.test.js's
// own contentNode()/eventTarget() stub style.
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

describe("getContentRectFor (Stage 4.7.2)", () => {
  it("reads the rect from the domRefs-registered element", () => {
    const item = { id: "a", contentSize: [10, 10] };
    const el = contentNode({
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        right: 70,
        bottom: 50,
        width: 60,
        height: 30,
      }),
    });
    const domRefs = new Map([["a", el]]);

    expect(getContentRectFor(domRefs, item)).toEqual({
      left: 10,
      top: 20,
      right: 70,
      bottom: 50,
      width: 60,
      height: 30,
    });
  });

  it("falls back to contentSize with a 0,0 origin when no element is registered", () => {
    const item = { id: "missing", contentSize: [40, 20] };
    const domRefs = new Map();

    expect(getContentRectFor(domRefs, item)).toEqual({
      left: 0,
      top: 0,
      right: 40,
      bottom: 20,
      width: 40,
      height: 20,
    });
  });
});

describe("buildDragGhost / moveDragGhost (Stage 4.7.2)", () => {
  beforeEach(() => {
    globalThis.document = { createElement: () => contentNode() };
  });

  it("clones the dragged item's registered element and centers it on the cursor", () => {
    const item = { id: "a" };
    const el = contentNode({ offsetWidth: 60, offsetHeight: 30 });
    const domRefs = new Map([["a", el]]);
    const port = {
      append: vi.fn(),
      getBoundingClientRect: () => ({ left: 5, top: 5 }),
    };

    const result = buildDragGhost(domRefs, port, [item], [35, 40]);

    expect(el.cloneNode).toHaveBeenCalledWith(true);
    expect(port.append).toHaveBeenCalledWith(result.ghost);
    expect(result.ghost.classList.add).toHaveBeenCalledWith("ghost");
    // (35-5) - 60/2 = 0, (40-5) - 30/2 = 20
    expect(result.position).toEqual([0, 20]);
  });

  it("adds a count badge when dragging more than one item", () => {
    const itemA = { id: "a" };
    const itemB = { id: "b" };
    const el = contentNode({ offsetWidth: 60, offsetHeight: 30 });
    const domRefs = new Map([["a", el]]);
    const port = {
      append: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    };

    const result = buildDragGhost(domRefs, port, [itemA, itemB], [0, 0]);

    expect(result.ghost.appendChild).toHaveBeenCalledOnce();
  });

  it("returns null when the dragged item has no registered DOM ref", () => {
    const item = { id: "missing" };
    const port = {
      append: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    };

    expect(buildDragGhost(new Map(), port, [item], [0, 0])).toBeNull();
    expect(port.append).not.toHaveBeenCalled();
  });

  it("moveDragGhost mutates position in place and writes left/top", () => {
    const ghost = { style: {} };
    const position = [10, 20];

    const result = moveDragGhost(ghost, position, [5, -5]);

    expect(result).toBe(position);
    expect(position).toEqual([15, 15]);
    expect(ghost.style.left).toBe("15px");
    expect(ghost.style.top).toBe("15px");
  });
});

describe("visualizeNewDragState (Stage 4.7.2)", () => {
  it("clears the previous target's highlight before applying a new one", () => {
    const prevItem = { id: "prev" };
    const nextItem = { id: "next" };
    const prevEl = contentNode();
    prevEl.style.boxShadow = "1px 1px 2px -2px #000";
    const nextEl = contentNode();
    const domRefs = new Map([
      ["prev", prevEl],
      ["next", nextEl],
    ]);

    visualizeNewDragState(domRefs, prevItem, {
      result: "append",
      target: nextItem,
    });

    expect(prevEl.style.boxShadow).toBe("");
    expect(nextEl.style.boxShadow).toBe("0px 0px 2px 2px #000");
  });

  it("offsets the shadow by direction for a sibling result", () => {
    const item = { id: "a" };
    const el = contentNode();
    const domRefs = new Map([["a", el]]);

    visualizeNewDragState(domRefs, null, {
      result: "sibling",
      direction: "right",
      target: item,
    });

    expect(el.style.boxShadow).toBe("5px 0px 2px -2px #000");
  });

  it("clears only, when state is null", () => {
    const prevItem = { id: "prev" };
    const prevEl = contentNode();
    prevEl.style.boxShadow = "1px 1px 2px -2px #000";
    const domRefs = new Map([["prev", prevEl]]);

    visualizeNewDragState(domRefs, prevItem, null);

    expect(prevEl.style.boxShadow).toBe("");
  });

  it("does nothing when the new target has no registered DOM ref", () => {
    const item = { id: "missing" };
    expect(() =>
      visualizeNewDragState(new Map(), null, {
        result: "append",
        target: item,
      }),
    ).not.toThrow();
  });
});

// Stage 4.7.3 of docs/08-phase4.7-drag-and-drop-refactor.md: event
// wiring, elementFromPoint reverse lookup, and newAction.js dispatch.
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

// Builds a minimal 3-level ItemNode-shaped tree (root -> middle -> leaf)
// with domRefs-registered content stubs, matching mouse.test.js's own
// buildThreeLevelTree() pattern but using childItems/side/isRoot
// (ItemNode's API) instead of item.js's Item.
function buildTree() {
  const root = {
    id: "root",
    isRoot: true,
    collapsed: false,
    contentSize: [80, 40],
  };
  const target = {
    id: "target",
    isRoot: false,
    parent: root,
    side: "right",
    collapsed: false,
    contentSize: [100, 100],
    resolvedLayout: { getChildDirection: () => "right" },
  };
  root.childItems = [target];
  target.childItems = [];
  const dragged = {
    id: "dragged",
    isRoot: false,
    parent: root,
    collapsed: false,
    contentSize: [60, 30],
  };
  dragged.childItems = [];
  root.childItems.push(dragged);

  const domRefs = new Map([
    [
      "root",
      contentNode({
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          right: 80,
          bottom: 40,
          width: 80,
          height: 40,
        }),
      }),
    ],
    [
      "target",
      contentNode({
        getBoundingClientRect: () => ({
          left: 100,
          top: 100,
          right: 200,
          bottom: 200,
          width: 100,
          height: 100,
        }),
      }),
    ],
    [
      "dragged",
      contentNode({
        getBoundingClientRect: () => ({
          left: 0,
          top: 200,
          right: 60,
          bottom: 230,
          width: 60,
          height: 30,
        }),
      }),
    ],
  ]);
  for (const el of domRefs.values()) {
    el.closest = (sel) => (sel === ".content" ? el : null);
  }
  return { root, target, dragged, domRefs };
}

describe("getItemForElement (Stage 4.7.3)", () => {
  it("resolves the item whose registered content element matches the event target", () => {
    const { root, target, domRefs } = buildTree();
    expect(getItemForElement(root, domRefs, domRefs.get("target"))).toBe(
      target,
    );
  });

  it("returns null for an element with no matching registration", () => {
    const { root, domRefs } = buildTree();
    const el = { closest: () => null };
    expect(getItemForElement(root, domRefs, el)).toBeNull();
  });
});

describe("getStableDropCollisionFor (Stage 4.7.3)", () => {
  beforeEach(() => {
    globalThis.document = { elementFromPoint: vi.fn() };
  });

  it("prefers the element directly under the pointer", () => {
    const { root, target, domRefs } = buildTree();
    document.elementFromPoint.mockReturnValue(domRefs.get("target"));

    const result = getStableDropCollisionFor(root, domRefs, [150, 150], null);

    expect(result.item).toBe(target);
  });

  it("falls back to the closest item when nothing is directly hit", () => {
    const { root, target, domRefs } = buildTree();
    document.elementFromPoint.mockReturnValue(null);

    const result = getStableDropCollisionFor(root, domRefs, [150, 150], null);

    expect(result.item).toBe(target); // closest to point 150,150
  });

  // Mirrors mouse.js's own getStableDropCollision() hysteresis (see
  // docs/d... no cross-doc reference needed, this is DOM/UX behavior
  // shared by both engines): a point at (80, 210) is, by raw distance,
  // closer to "dragged" (rect 0,200-60,230, center 30,215) than to
  // "target" (rect 100,100-200,200, center 150,150) -- but it still
  // falls inside target's DROP_TARGET_STICKY_PADDING-expanded rect
  // (76,76-224,224). Without hysteresis this point would resolve to
  // "dragged"; with a previousTarget of "target" passed in, it must
  // stay "target" instead, avoiding flicker in gaps between nodes.
  it("without a previousTarget, resolves to whichever item is nearest by raw distance", () => {
    const { root, dragged, domRefs } = buildTree();
    document.elementFromPoint.mockReturnValue(null);

    const result = getStableDropCollisionFor(root, domRefs, [80, 210], null);

    expect(result.item).toBe(dragged);
  });

  it("with a previousTarget still within its expanded rect, keeps it via hysteresis even though it is no longer the nearest item", () => {
    const { root, target, domRefs } = buildTree();
    document.elementFromPoint.mockReturnValue(null);

    const result = getStableDropCollisionFor(root, domRefs, [80, 210], target);

    expect(result.item).toBe(target);
  });
});

describe("finishNewDragDrop (Stage 4.7.3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispatches a single MoveItem action for an append result", () => {
    const { target, dragged } = buildTree();

    finishNewDragDrop({ result: "append", target }, [dragged]);

    expect(actionFn).toHaveBeenCalledOnce();
    expect(actionFn.mock.calls[0][0]).toBeInstanceOf(MoveItem);
    expect(actionFn.mock.calls[0][0].target).toBe(target);
  });

  it("dispatches a MoveItem with a computed sibling index for a sibling result", () => {
    const { root, target, dragged } = buildTree();

    finishNewDragDrop({ result: "sibling", direction: "bottom", target }, [
      dragged,
    ]);

    const dispatched = actionFn.mock.calls[0][0];
    expect(dispatched.target).toBe(root);
    expect(dispatched.targetIndex).toBe(root.childItems.indexOf(target) + 1);
  });

  // Regression test: dragging a same-parent sibling forward past its
  // own original position used to compute a targetIndex that was
  // stale by one, since it was derived from the array before the
  // dragged item removed itself (see insertChild()'s self-removal).
  it("adjusts the sibling index when the dragged item is being reordered forward within the same parent", () => {
    const root = { id: "root", isRoot: true, collapsed: false };
    const a = { id: "a", isRoot: false, parent: root, side: "right" };
    const b = { id: "b", isRoot: false, parent: root, side: "right" };
    const c = { id: "c", isRoot: false, parent: root, side: "right" };
    root.childItems = [a, b, c];

    // Drop `a` after `c` (direction "bottom" == insert after target).
    finishNewDragDrop({ result: "sibling", direction: "bottom", target: c }, [
      a,
    ]);

    const dispatched = actionFn.mock.calls[0][0];
    // Pre-move index of c is 2; without adjustment targetIndex would be
    // 3 (append), but since `a` sat before `c`, it must be 2 so that
    // removing `a` first (shifting b,c down by one) and inserting at 2
    // lands it right after c: [b, c, a].
    expect(dispatched.targetIndex).toBe(2);
  });

  it("does not adjust the sibling index when the dragged item is already after the target", () => {
    const root = { id: "root", isRoot: true, collapsed: false };
    const a = { id: "a", isRoot: false, parent: root, side: "right" };
    const b = { id: "b", isRoot: false, parent: root, side: "right" };
    const d = { id: "d", isRoot: false, parent: root, side: "right" };
    root.childItems = [a, b, d];

    // Drop `d` before `b` (direction "top" == insert before target).
    finishNewDragDrop({ result: "sibling", direction: "top", target: b }, [d]);

    const dispatched = actionFn.mock.calls[0][0];
    expect(dispatched.targetIndex).toBe(1);
  });

  it("does not adjust the sibling index for a move between different parents", () => {
    const root = { id: "root", isRoot: true, collapsed: false };
    const branchA = { id: "branchA", isRoot: false, parent: root };
    const branchB = { id: "branchB", isRoot: false, parent: root };
    const leaf = { id: "leaf", isRoot: false, parent: branchA };
    const b = { id: "b", isRoot: false, parent: branchB, side: "right" };
    const c = { id: "c", isRoot: false, parent: branchB, side: "right" };
    branchB.childItems = [b, c];

    finishNewDragDrop({ result: "sibling", direction: "bottom", target: c }, [
      leaf,
    ]);

    const dispatched = actionFn.mock.calls[0][0];
    expect(dispatched.targetIndex).toBe(2); // unadjusted: leaf.parent !== branchB
  });

  it("wraps multiple dragged items in a Multi action", () => {
    const { target, dragged } = buildTree();
    const other = { id: "other", isRoot: false };

    finishNewDragDrop({ result: "append", target }, [dragged, other]);

    expect(actionFn.mock.calls[0][0]).toBeInstanceOf(Multi);
    expect(actionFn.mock.calls[0][0].actions).toHaveLength(2);
  });

  it("does nothing when the target is inside the dragged item's own subtree", () => {
    const { root, target } = buildTree();
    // target is being dragged itself
    finishNewDragDrop({ result: "append", target }, [target]);
    expect(actionFn).not.toHaveBeenCalled();
    void root;
  });
});

describe("mousedown/mousemove/mouseup wiring (Stage 4.7.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveMode.value = "canvas";
    setCurrentItem(null);
    setSelectedItems(new Set());
    setEditing(false);
    globalThis.document = {
      elementFromPoint: vi.fn(() => null),
      createElement: () => contentNode(),
    };
  });

  it("registers mousedown/click on port and cleans up on dispose", () => {
    const port = eventTarget();
    const container = { focus: vi.fn() };
    initMouse(new Map(), port, container, () => null);

    expect(port.addEventListener).toHaveBeenCalledWith(
      "mousedown",
      expect.any(Function),
    );
    expect(port.addEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
    );

    disposeMouse();

    expect(port.removeEventListener).toHaveBeenCalledWith(
      "mousedown",
      expect.any(Function),
    );
    expect(port.removeEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
    );
  });

  it("ignores mousedown while the canvas is backgrounded", () => {
    const { root, domRefs } = buildTree();
    const port = eventTarget();
    const container = { focus: vi.fn() };
    initMouse(domRefs, port, container, () => root);
    mockActiveMode.value = "notes";

    port.dispatch("mousedown", {
      target: domRefs.get("dragged"),
      clientX: 10,
      clientY: 210,
      preventDefault: vi.fn(),
    });

    expect(container.focus).not.toHaveBeenCalled();
    disposeMouse();
  });

  it("drags a node onto another and dispatches a MoveItem action on mouseup", () => {
    const { root, target, dragged, domRefs } = buildTree();
    const port = eventTarget();
    port.append = vi.fn();
    port.getBoundingClientRect = () => ({ left: 0, top: 0 });
    const container = { focus: vi.fn() };
    initMouse(domRefs, port, container, () => root);
    document.elementFromPoint.mockImplementation((x, y) =>
      x >= 100 && x <= 200 && y >= 100 && y <= 200
        ? domRefs.get("target")
        : null,
    );

    port.dispatch("mousedown", {
      target: domRefs.get("dragged"),
      clientX: 10,
      clientY: 210,
      preventDefault: vi.fn(),
    });
    expect(container.focus).toHaveBeenCalledOnce();

    port.dispatch("mousemove", {
      target: domRefs.get("dragged"),
      clientX: 150,
      clientY: 150,
      preventDefault: vi.fn(),
    });
    port.dispatch("mouseup", { target: domRefs.get("target") });

    expect(actionFn).toHaveBeenCalledOnce();
    expect(actionFn.mock.calls[0][0].item).toBe(dragged);
    expect(actionFn.mock.calls[0][0].target).toBe(target);

    disposeMouse();
  });

  it("suppresses the synthetic post-drag click", () => {
    const { root, domRefs } = buildTree();
    const port = eventTarget();
    port.append = vi.fn();
    port.getBoundingClientRect = () => ({ left: 0, top: 0 });
    const container = { focus: vi.fn() };
    initMouse(domRefs, port, container, () => root);

    port.dispatch("mousedown", {
      target: domRefs.get("dragged"),
      clientX: 10,
      clientY: 210,
      preventDefault: vi.fn(),
    });
    port.dispatch("mousemove", {
      target: domRefs.get("dragged"),
      clientX: 30,
      clientY: 220,
      preventDefault: vi.fn(),
    });
    port.dispatch("mouseup", { target: domRefs.get("dragged") });

    const preventDefault = vi.fn();
    port.dispatch("click", { preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();

    disposeMouse();
  });

  it("finalizes an in-progress edit elsewhere before starting a drag", () => {
    const { root, target, domRefs } = buildTree();
    setCurrentItem(target);
    setEditing(true);
    const port = eventTarget();
    port.append = vi.fn();
    port.getBoundingClientRect = () => ({ left: 0, top: 0 });
    const container = { focus: vi.fn() };
    initMouse(domRefs, port, container, () => root);

    port.dispatch("mousedown", {
      target: domRefs.get("dragged"),
      clientX: 10,
      clientY: 210,
      preventDefault: vi.fn(),
    });

    expect(commitEditing).toHaveBeenCalledWith(target);
    disposeMouse();
  });
});

// Phase 5 of docs/08-mindmap-engine-refactor.md: handleItemLinkClick
// replaces item.js's imperative dom.link addEventListener() with a
// plain JSX onClick handler (see NewMindMapPreview.jsx), sharing the
// isSameOrigin/navigateTo bridge with the old engine instead of each
// engine owning its own copy.
describe("newMouse.js handleItemLinkClick (Phase 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveMode.value = "canvas";
    globalThis.window = { location: { href: "https://example.com/maps/abc" } };
  });

  it("ignores clicks while the canvas is backgrounded", () => {
    mockActiveMode.value = "notes";
    handleItemLinkClick({ url: "https://example.com/maps/xyz" });
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("does nothing when the item has no url", () => {
    handleItemLinkClick({ url: "" });
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("navigates in place for a same-origin url", () => {
    isSameOrigin.mockReturnValue(true);
    navigateTo.mockReturnValue(true);
    handleItemLinkClick({ url: "https://example.com/maps/xyz" });
    expect(navigateTo).toHaveBeenCalledWith("/maps/xyz");
  });

  it("falls back to a full navigation when nothing is registered yet", () => {
    isSameOrigin.mockReturnValue(true);
    navigateTo.mockReturnValue(false);
    handleItemLinkClick({ url: "https://example.com/maps/xyz" });
    expect(window.location.href).toBe("https://example.com/maps/xyz");
  });

  it("opens external urls in a new tab", () => {
    isSameOrigin.mockReturnValue(false);
    const openSpy = vi.fn();
    globalThis.window.open = openSpy;
    handleItemLinkClick({ url: "https://external.example/" });
    expect(openSpy).toHaveBeenCalledWith(
      "https://external.example/",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
