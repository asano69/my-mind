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

describe("keyboard focusout self-heal guard (focusin-cancelled)", () => {
  // Regression test for the title-input-unfocusable bug (see CLAUDE.md,
  // "タイトル編集不可バグ" Phase 2). The guard used to check
  // document.activeElement after a fixed delay (a microtask, then one
  // rAF), which assumes a focus transition always completes within that
  // window. A real element claiming focus — however long it takes —
  // must cancel the pending restore; this suite proves the guard no
  // longer depends on a specific number of frames.
  let rafCallbacks;
  let focusinListeners;
  const bodySentinel = {};

  beforeEach(() => {
    rafCallbacks = [];
    focusinListeners = [];
    globalThis.requestAnimationFrame = vi.fn((cb) => rafCallbacks.push(cb));
    globalThis.cancelAnimationFrame = vi.fn((id) => {
      rafCallbacks = rafCallbacks.filter((cb) => cb !== id);
    });
    globalThis.document = {
      activeElement: bodySentinel,
      body: bodySentinel,
      addEventListener: vi.fn((type, listener) => {
        if (type === "focusin") focusinListeners.push(listener);
      }),
      removeEventListener: vi.fn((type, listener) => {
        if (type === "focusin") {
          const i = focusinListeners.indexOf(listener);
          if (i > -1) focusinListeners.splice(i, 1);
        }
      }),
    };
  });

  afterEach(() => {
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
    delete globalThis.document;
  });

  function runRaf() {
    const cbs = rafCallbacks.slice();
    rafCallbacks = [];
    cbs.forEach((cb) => cb());
  }

  function dispatchFocusIn() {
    focusinListeners.forEach((l) => l());
  }

  it("does not steal focus back once a real focusin lands, even if the rAF check has not fired yet", () => {
    const container = eventTarget();
    keyboard.init(container);
    container.focus.mockClear(); // init() itself calls container.focus() once

    container.dispatch("focusout", { currentTarget: container });
    // A real element (e.g. TopBar's title input) claims focus. This is
    // authoritative regardless of how many frames it took to happen.
    document.activeElement = {};
    dispatchFocusIn();
    runRaf();

    expect(container.focus).not.toHaveBeenCalled();
    keyboard.dispose(container);
  });

  it("still restores focus to the container if nothing ever claims it", () => {
    const container = eventTarget();
    keyboard.init(container);
    container.focus.mockClear(); // init() itself calls container.focus() once

    container.dispatch("focusout", { currentTarget: container });
    runRaf();

    expect(container.focus).toHaveBeenCalledOnce();
    keyboard.dispose(container);
  });

  it("dispose() removes the document-level focusin listener", () => {
    const container = eventTarget();
    keyboard.init(container);
    keyboard.dispose(container);

    expect(document.removeEventListener).toHaveBeenCalledWith(
      "focusin",
      expect.any(Function),
    );
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
