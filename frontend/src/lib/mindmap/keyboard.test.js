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
});
