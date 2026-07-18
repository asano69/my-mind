import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const command = {
  keys: [{ code: "KeyZ", ctrlKey: true }],
  get isValid() {
    return true;
  },
  execute,
};

vi.mock("./ui/ui.js", () => ({ isActive: vi.fn(() => false) }));
vi.mock("./command/command.js", () => ({ repo: new Map([["undo", command]]) }));
// mockActiveMode: mutable holder so individual tests can flip it, per
// docs/workspace-mode-switch-refactor.md's Phase 3 guard.
const mockActiveMode = { value: "canvas" };
vi.mock("./store.js", () => ({ activeMode: () => mockActiveMode.value }));

const keyboard = await import("./keyboard.js");

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type, listener) => {
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
    }),
    focus: vi.fn(),
    dispatch(type, event) {
      listeners.get(type)?.(event);
    },
  };
}

describe("keyboard listener scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveMode.value = "canvas";
  });

  it("registers shortcuts on the provided container, not window", () => {
    const container = eventTarget();
    keyboard.init(container);
    expect(container.addEventListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
    expect(container.focus).toHaveBeenCalledOnce();
    const preventDefault = vi.fn();
    container.dispatch("keydown", {
      code: "KeyZ",
      ctrlKey: true,
      metaKey: false,
      isComposing: false,
      preventDefault,
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();

    keyboard.dispose(container);
    expect(container.removeEventListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
  });
  it("ignores shortcuts while the canvas is backgrounded (activeMode !== 'canvas')", () => {
    const container = eventTarget();
    keyboard.init(container);
    mockActiveMode.value = "notes";

    const preventDefault = vi.fn();
    container.dispatch("keydown", {
      code: "KeyZ",
      ctrlKey: true,
      metaKey: false,
      isComposing: false,
      preventDefault,
    });

    expect(execute).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();

    keyboard.dispose(container);
  });
});
