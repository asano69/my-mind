import { describe, expect, it, vi, beforeEach } from "vitest";

const menuOpen = vi.fn();
const finishExecute = vi.fn();
const getCommand = vi.fn((id) => (id === "finish" ? { execute: finishExecute } : {}));
const getItemFor = vi.fn();

vi.mock("./ui/context-menu.js", () => ({ open: menuOpen }));
vi.mock("./command/command.js", () => ({ repo: { get: getCommand } }));
vi.mock("./action.js", () => ({}));
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
});
