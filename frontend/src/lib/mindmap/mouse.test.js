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
