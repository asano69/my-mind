import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./map.js", () => ({ default: class Map {} }));
vi.mock("./my-mind.js", () => ({
  editing: false,
  currentItem: {},
  getAllSelected: vi.fn(() => []),
  action: vi.fn(),
}));
vi.mock("./ui/ui.js", () => ({ isActive: vi.fn(() => false) }));
vi.mock("./action.js", () => ({}));

const mockActiveMode = { value: "canvas" };
vi.mock("./store.js", () => ({ activeMode: () => mockActiveMode.value }));

vi.mock("./format/format.js", () => ({
  repo: new Map([
    [
      "plaintext",
      {
        to: vi.fn(() => ""),
        from: vi.fn(() => ({ root: { text: "", children: [] } })),
      },
    ],
  ]),
}));

const clipboard = await import("./clipboard.js");

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type, listener) => {
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
    }),
    dispatch(type, event) {
      listeners.get(type)?.(event);
    },
  };
}

describe("clipboard listener scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveMode.value = "canvas";
  });

  it("registers clipboard events on the provided container", () => {
    const container = eventTarget();

    clipboard.init(container);

    expect(container.addEventListener).toHaveBeenCalledWith(
      "cut",
      expect.any(Function),
    );
    expect(container.addEventListener).toHaveBeenCalledWith(
      "copy",
      expect.any(Function),
    );
    expect(container.addEventListener).toHaveBeenCalledWith(
      "paste",
      expect.any(Function),
    );

    clipboard.dispose(container);

    expect(container.removeEventListener).toHaveBeenCalledWith(
      "cut",
      expect.any(Function),
    );
    expect(container.removeEventListener).toHaveBeenCalledWith(
      "copy",
      expect.any(Function),
    );
    expect(container.removeEventListener).toHaveBeenCalledWith(
      "paste",
      expect.any(Function),
    );
  });
  it("ignores copy events while the canvas is backgrounded", () => {
    const container = eventTarget();
    clipboard.init(container);
    mockActiveMode.value = "notes";

    const setData = vi.fn();
    container.dispatch("copy", {
      preventDefault: vi.fn(),
      clipboardData: { setData },
    });

    expect(setData).not.toHaveBeenCalled();

    clipboard.dispose(container);
  });
});
