import { beforeEach, describe, expect, it, vi } from "vitest";

const mockActiveMode = { value: "canvas" };
vi.mock("../store.js", () => ({ activeMode: () => mockActiveMode.value }));
vi.mock("./newEdit.js", () => ({
  startEditing: vi.fn(() => ({})),
  commitEditing: vi.fn(),
  discardEditing: vi.fn(),
}));

const newKeyboard = await import("./newKeyboard.js");
const {
  currentItem,
  setCurrentItem,
  selectedItems,
  setSelectedItems,
  selectionCursor,
  setSelectionCursor,
  editing,
  setEditing,
} = await import("./itemSelection.js");
const { startEditing, commitEditing, discardEditing } =
  await import("./newEdit.js");
const history = await import("./history.js");

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
  setEditing(false);
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

describe("newKeyboard.js text editing (Phase 4.5)", () => {
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

  it("Space starts editing when startEditing() finds a DOM ref", () => {
    const container = eventTarget();
    newKeyboard.init(container);
    const item = { id: "a" };
    setCurrentItem(item);

    container.dispatch("keydown", {
      code: "Space",
      isComposing: false,
      preventDefault: vi.fn(),
    });

    expect(startEditing).toHaveBeenCalledWith(item);
    expect(editing()).toBe(true);

    newKeyboard.dispose(container);
  });

  it("does not enter editing mode if startEditing() finds no DOM ref", () => {
    startEditing.mockReturnValueOnce(null);
    const container = eventTarget();
    newKeyboard.init(container);
    setCurrentItem({ id: "a" });

    container.dispatch("keydown", {
      code: "Space",
      isComposing: false,
      preventDefault: vi.fn(),
    });

    expect(editing()).toBe(false);

    newKeyboard.dispose(container);
  });

  it("Enter commits editing and leaves edit mode", () => {
    const container = eventTarget();
    newKeyboard.init(container);
    const item = { id: "a" };
    setCurrentItem(item);
    setEditing(true);

    container.dispatch("keydown", {
      code: "Enter",
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      isComposing: false,
      preventDefault: vi.fn(),
    });

    expect(commitEditing).toHaveBeenCalledWith(item);
    expect(editing()).toBe(false);

    newKeyboard.dispose(container);
  });

  it("Escape discards editing and leaves edit mode", () => {
    const container = eventTarget();
    newKeyboard.init(container);
    const item = { id: "a" };
    setCurrentItem(item);
    setEditing(true);

    container.dispatch("keydown", {
      code: "Escape",
      isComposing: false,
      preventDefault: vi.fn(),
    });

    expect(discardEditing).toHaveBeenCalledWith(item);
    expect(editing()).toBe(false);

    newKeyboard.dispose(container);
  });

  it("ignores normal-mode shortcuts (e.g. arrow-key selection) while editing", () => {
    const container = eventTarget();
    newKeyboard.init(container);
    const next = { id: "next" };
    const item = {
      id: "current",
      resolvedLayout: { pick: vi.fn(() => next) },
    };
    setCurrentItem(item);
    setEditing(true);

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

  it("ignores Enter/Escape editing commands while not editing", () => {
    const container = eventTarget();
    newKeyboard.init(container);
    // Deliberately no currentItem selected here: while not editing,
    // Enter also matches the mode:"normal" insert-sibling command (see
    // command/command.js's old InsertSibling, which binds Enter the
    // same way with no editMode restriction), which is real intended
    // behavior, not something to suppress. This test only cares that
    // the mode:"editing" commit command isn't the one that fires; a
    // real ItemNode would carry isRoot/parent/children, but a stub
    // missing those would crash inside InsertNewItem's do() for
    // reasons unrelated to what this test checks. No selection at all
    // keeps the insert command's own `if (!item) return;` guard as the
    // early exit instead.

    container.dispatch("keydown", {
      code: "Enter",
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      isComposing: false,
      preventDefault: vi.fn(),
    });

    expect(commitEditing).not.toHaveBeenCalled();

    newKeyboard.dispose(container);
  });
});

describe("newKeyboard.js undo/redo (Phase 4.6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveMode.value = "canvas";
    resetSelectionState();
    history.reset();
    globalThis.document = {
      activeElement: null,
      body: {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    globalThis.requestAnimationFrame = vi.fn(() => 0);
    globalThis.cancelAnimationFrame = vi.fn();
  });

  it("Ctrl+Z undoes the last pushed action", () => {
    const container = eventTarget();
    newKeyboard.init(container);
    const log = [];
    history.push({
      do() {
        log.push("do");
      },
      undo() {
        log.push("undo");
      },
    });

    container.dispatch("keydown", {
      code: "KeyZ",
      ctrlKey: true,
      shiftKey: false,
      metaKey: false,
      isComposing: false,
      preventDefault: vi.fn(),
    });

    expect(log).toEqual(["undo"]);
    newKeyboard.dispose(container);
  });

  it("Ctrl+Y redoes the last undone action", () => {
    const container = eventTarget();
    newKeyboard.init(container);
    const log = [];
    history.push({
      do() {
        log.push("do");
      },
      undo() {
        log.push("undo");
      },
    });
    history.back(); // sets up the redo state; itself logs "undo"
    log.length = 0; // only the Ctrl+Y dispatch below is under test

    container.dispatch("keydown", {
      code: "KeyY",
      ctrlKey: true,
      shiftKey: false,
      metaKey: false,
      isComposing: false,
      preventDefault: vi.fn(),
    });

    expect(log).toEqual(["do"]);
    newKeyboard.dispose(container);
  });

  it("does nothing when there is nothing to undo/redo", () => {
    const container = eventTarget();
    newKeyboard.init(container);

    expect(() =>
      container.dispatch("keydown", {
        code: "KeyZ",
        ctrlKey: true,
        shiftKey: false,
        metaKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
      }),
    ).not.toThrow();

    newKeyboard.dispose(container);
  });
});
