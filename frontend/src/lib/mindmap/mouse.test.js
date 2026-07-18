import { describe, expect, it, vi, beforeEach } from "vitest";

const menuOpen = vi.fn();
const finishExecute = vi.fn();
const getCommand = vi.fn((id) =>
  id === "finish" ? { execute: finishExecute } : {},
);
const getItemFor = vi.fn();

vi.mock("./ui/context-menu.js", () => ({ open: menuOpen }));
vi.mock("./command/command.js", () => ({ repo: { get: getCommand } }));
vi.mock("./action.js", () => ({}));

// mockActiveMode: mutable holder so individual tests can flip it, per
// docs/workspace-mode-switch-refactor.md's Phase 3 guard. Must be
// declared before the vi.mock("./store.js", ...) call below references it.
const { mockActiveMode } = vi.hoisted(() => ({
  mockActiveMode: { value: "canvas" },
}));
vi.mock("./store.js", () => ({ activeMode: () => mockActiveMode.value }));

vi.mock("./my-mind.js", () => ({
  get currentMap() {
    return { getItemFor };
  },
  get currentItem() {
    return null;
  },
  get editing() {
    return false;
  },
  selectedItems: new Set(),
  addToSelection: vi.fn(),
  selectItem: vi.fn(),
  getAllSelected: vi.fn(() => []),
}));

const mouse = await import("./mouse.js");

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
});
