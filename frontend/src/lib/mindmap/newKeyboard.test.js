import { beforeEach, describe, expect, it, vi } from "vitest";

const mockActiveMode = { value: "canvas" };
vi.mock("./store.js", () => ({ activeMode: () => mockActiveMode.value }));

const newKeyboard = await import("./newKeyboard.js");
const {
  currentItem,
  setCurrentItem,
  selectedItems,
  setSelectedItems,
  selectionCursor,
  setSelectionCursor,
} = await import("./itemSelection.js");

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

function resetSelectionState() {
  setCurrentItem(null);
  setSelectedItems(new Set());
  setSelectionCursor(null);
}

describe("newKeyboard.js selection shortcuts (Phase 4.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveMode.value = "canvas";
    resetSelectionState();
    globalThis.document = {
      activeElement: null,
      body: {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    globalThis.requestAnimationFrame = vi.fn(() => 0);
    globalThis.cancelAnimationFrame = vi.fn();
  });

  it("registers keydown/focusout on the container and focusin on document", () => {
    const container = eventTarget();
    newKeyboard.init(container);

    expect(container.addEventListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
    expect(container.addEventListener).toHaveBeenCalledWith(
      "focusout",
      expect.any(Function),
    );
    expect(document.addEventListener).toHaveBeenCalledWith(
      "focusin",
      expect.any(Function),
    );
    expect(container.focus).toHaveBeenCalledOnce();

    newKeyboard.dispose(container);
    expect(container.removeEventListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
  });

  it("arrow key moves selection via resolvedLayout.pick", () => {
    const container = eventTarget();
    newKeyboard.init(container);

    const next = { id: "next" };
    const item = {
      id: "current",
      resolvedLayout: { pick: vi.fn(() => next) },
    };
    setCurrentItem(item);

    const preventDefault = vi.fn();
    container.dispatch("keydown", {
      code: "ArrowRight",
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      isComposing: false,
      preventDefault,
    });

    expect(item.resolvedLayout.pick).toHaveBeenCalledWith(item, "right");
    expect(preventDefault).toHaveBeenCalled();
    expect(currentItem()).toBe(next);

    newKeyboard.dispose(container);
  });

  it("shift+arrow extends the multi-selection instead of replacing currentItem", () => {
    const container = eventTarget();
    newKeyboard.init(container);

    const next = { id: "next" };
    const item = {
      id: "current",
      resolvedLayout: { pick: vi.fn(() => next) },
    };
    setCurrentItem(item);

    container.dispatch("keydown", {
      code: "ArrowDown",
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      isComposing: false,
      preventDefault: vi.fn(),
    });

    expect(item.resolvedLayout.pick).toHaveBeenCalledWith(item, "bottom");
    expect(currentItem()).toBe(item); // unchanged
    expect(selectedItems().has(next)).toBe(true);
    expect(selectionCursor()).toBe(next);

    newKeyboard.dispose(container);
  });

  it("shift+arrow is a no-op when pick() returns the same item (boundary reached)", () => {
    const container = eventTarget();
    newKeyboard.init(container);

    const item = {
      id: "current",
      resolvedLayout: { pick: vi.fn((i) => i) },
    };
    setCurrentItem(item);

    container.dispatch("keydown", {
      code: "ArrowLeft",
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      isComposing: false,
      preventDefault: vi.fn(),
    });

    expect(selectedItems().size).toBe(0);

    newKeyboard.dispose(container);
  });

  it("Home selects the root by walking up the parent chain", () => {
    const container = eventTarget();
    newKeyboard.init(container);

    const root = { id: "root", isRoot: true };
    const middle = { id: "middle", isRoot: false, parent: root };
    const leaf = { id: "leaf", isRoot: false, parent: middle };
    setCurrentItem(leaf);

    container.dispatch("keydown", {
      code: "Home",
      isComposing: false,
      preventDefault: vi.fn(),
    });

    expect(currentItem()).toBe(root);

    newKeyboard.dispose(container);
  });

  it("Backspace selects the parent (non-mac)", () => {
    const container = eventTarget();
    newKeyboard.init(container);

    const parent = { id: "parent", isRoot: false };
    const child = { id: "child", isRoot: false, parent };
    setCurrentItem(child);

    container.dispatch("keydown", {
      code: "Backspace",
      isComposing: false,
      preventDefault: vi.fn(),
    });

    expect(currentItem()).toBe(parent);

    newKeyboard.dispose(container);
  });

  it("Backspace on the root item is a no-op", () => {
    const container = eventTarget();
    newKeyboard.init(container);

    const root = { id: "root", isRoot: true };
    setCurrentItem(root);

    container.dispatch("keydown", {
      code: "Backspace",
      isComposing: false,
      preventDefault: vi.fn(),
    });

    expect(currentItem()).toBe(root);

    newKeyboard.dispose(container);
  });

  it("ignores shortcuts while composing (IME)", () => {
    const container = eventTarget();
    newKeyboard.init(container);

    const next = { id: "next" };
    const item = {
      id: "current",
      resolvedLayout: { pick: vi.fn(() => next) },
    };
    setCurrentItem(item);

    container.dispatch("keydown", {
      code: "ArrowRight",
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      isComposing: true,
      preventDefault: vi.fn(),
    });

    expect(item.resolvedLayout.pick).not.toHaveBeenCalled();
    expect(currentItem()).toBe(item);

    newKeyboard.dispose(container);
  });

  it("ignores shortcuts while the canvas is backgrounded", () => {
    const container = eventTarget();
    newKeyboard.init(container);
    mockActiveMode.value = "notes";

    const next = { id: "next" };
    const item = {
      id: "current",
      resolvedLayout: { pick: vi.fn(() => next) },
    };
    setCurrentItem(item);

    container.dispatch("keydown", {
      code: "ArrowRight",
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      isComposing: false,
      preventDefault: vi.fn(),
    });

    expect(item.resolvedLayout.pick).not.toHaveBeenCalled();

    newKeyboard.dispose(container);
  });
});
