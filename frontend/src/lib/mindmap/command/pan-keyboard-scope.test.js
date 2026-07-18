import { beforeEach, describe, expect, it, vi } from "vitest";

const moveBy = vi.fn();

vi.mock("../history.js", () => ({
  canBack: vi.fn(() => false),
  canForward: vi.fn(() => false),
  back: vi.fn(),
  forward: vi.fn(),
}));
vi.mock("../my-mind.js", () => ({
  get editing() {
    return false;
  },
  get currentItem() {
    return { isRoot: true, children: [], collapsed: false };
  },
  get currentMap() {
    return {
      moveBy,
      center: vi.fn(),
      adjustFontSize: vi.fn(),
      ensureItemVisibility: vi.fn(),
    };
  },
  action: vi.fn(),
  showMap: vi.fn(),
  setThrobber: vi.fn(),
  getAllSelected: vi.fn(() => []),
}));
vi.mock("../help.js", () => ({ toggle: vi.fn() }));
vi.mock("../ui/notes.js", () => ({ toggle: vi.fn() }));
vi.mock("../ui/ui.js", () => ({ toggle: vi.fn() }));
vi.mock("../ui/io.js", () => ({
  quickSave: vi.fn(),
  show: vi.fn(),
  saveWithSvg: vi.fn(),
  resetCurrentMap: vi.fn(),
}));
vi.mock("../ui/toast.js", () => ({ showToast: vi.fn() }));
vi.mock("../backend/image.js", () => ({ default: vi.fn() }));
vi.mock("../action.js", () => ({
  InsertNewItem: vi.fn(),
  RemoveItem: vi.fn(),
  Multi: vi.fn(),
  Swap: vi.fn(),
  SetSide: vi.fn(),
}));
vi.mock("../map.js", () => ({ default: vi.fn() }));
const mockActiveMode = { value: "canvas" };
vi.mock("../store.js", () => ({ activeMode: () => mockActiveMode.value }));

const { repo, setKeyboardScope } = await import("./command.js");

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
      listeners.get(type)?.handleEvent?.(event);
    },
  };
}

describe("pan command keyboard scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    repo.get("pan").dispose();
    mockActiveMode.value = "canvas";
  });

  it("registers and removes keyup on the configured container", () => {
    const container = eventTarget();
    setKeyboardScope(container);

    repo.get("pan").execute({ code: "KeyW" });

    expect(container.addEventListener).toHaveBeenCalledWith(
      "keyup",
      repo.get("pan"),
    );
    expect(moveBy).toHaveBeenCalledWith([0, 15]);

    container.dispatch("keyup", { code: "KeyW" });

    expect(container.removeEventListener).toHaveBeenCalledWith(
      "keyup",
      repo.get("pan"),
    );
  });
  it("stops moving the map once the canvas is backgrounded mid-hold", () => {
    const container = eventTarget();
    setKeyboardScope(container);

    repo.get("pan").execute({ code: "KeyW" });
    expect(moveBy).toHaveBeenCalledTimes(1);

    mockActiveMode.value = "notes";
    vi.advanceTimersByTime(50);

    // The setInterval loop is still running, but step() should now be a
    // no-op, so moveBy must not have been called again.
    expect(moveBy).toHaveBeenCalledTimes(1);

    container.dispatch("keyup", { code: "KeyW" });
  });
});
