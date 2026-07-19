import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("keyboard focusout self-heal guard (rAF-deferred)", () => {
  // Regression test for the title-input-unfocusable bug (see CLAUDE.md,
  // "タイトル編集不可バグ" Phase 2). handleFocusOut used to check
  // document.activeElement inside a microtask, which can fire before a
  // slower focus transition (e.g. onto TopBar's title <input>) actually
  // completes, incorrectly stealing focus back to the canvas container.
  let rafCallbacks;
  const bodySentinel = {};

  beforeEach(() => {
    rafCallbacks = [];
    globalThis.requestAnimationFrame = vi.fn((cb) => rafCallbacks.push(cb));
    globalThis.document = { activeElement: bodySentinel, body: bodySentinel };
  });

  afterEach(() => {
    delete globalThis.requestAnimationFrame;
    delete globalThis.document;
  });

  function runRaf() {
    const cbs = rafCallbacks.slice();
    rafCallbacks = [];
    cbs.forEach((cb) => cb());
  }

  it("does not steal focus back if a real element claims it before the rAF check runs", () => {
    const container = eventTarget();
    keyboard.init(container);
    container.focus.mockClear(); // init() itself calls container.focus() once

    container.dispatch("focusout", { currentTarget: container });
    // Simulate a slower focus transition landing on a real element (e.g.
    // TopBar's title input) after the focusout fires but before the
    // rAF-deferred check runs.
    document.activeElement = {};
    runRaf();

    expect(container.focus).not.toHaveBeenCalled();
    keyboard.dispose(container);
  });

  it("still restores focus to the container if nothing claimed it by the rAF check", () => {
    const container = eventTarget();
    keyboard.init(container);
    container.focus.mockClear(); // init() itself calls container.focus() once

    container.dispatch("focusout", { currentTarget: container });
    runRaf();

    expect(container.focus).toHaveBeenCalledOnce();
    keyboard.dispose(container);
  });
});

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
