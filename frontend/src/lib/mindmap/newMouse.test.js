import { describe, expect, it, vi, beforeEach } from "vitest";

const mockActiveMode = { value: "canvas" };
vi.mock("./store.js", () => ({ activeMode: () => mockActiveMode.value }));
vi.mock("./newEdit.js", () => ({ startEditing: vi.fn(() => ({})) }));

const {
  handleItemClick,
  handleItemDblClick,
  getContentRectFor,
  buildDragGhost,
  moveDragGhost,
  visualizeNewDragState,
} = await import("./newMouse.js");
const {
  currentItem,
  setCurrentItem,
  selectedItems,
  setSelectedItems,
  editing,
  setEditing,
} = await import("./itemSelection.js");
const { startEditing } = await import("./newEdit.js");

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
    const port = { append: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0 }) };

    const result = buildDragGhost(domRefs, port, [itemA, itemB], [0, 0]);

    expect(result.ghost.appendChild).toHaveBeenCalledOnce();
  });

  it("returns null when the dragged item has no registered DOM ref", () => {
    const item = { id: "missing" };
    const port = { append: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0 }) };

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
      visualizeNewDragState(new Map(), null, { result: "append", target: item }),
    ).not.toThrow();
  });
});
