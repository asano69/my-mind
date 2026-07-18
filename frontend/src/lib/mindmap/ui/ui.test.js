import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const restore = vi.fn();
const initNotes = vi.fn();
const disposeNotes = vi.fn();
const initIo = vi.fn();
const disposeIo = vi.fn();
const initMenu = vi.fn();
const disposeMenu = vi.fn();

vi.mock("../my-mind.js", () => ({ currentItem: null }));
vi.mock("./notes.js", () => ({ init: initNotes, dispose: disposeNotes }));
vi.mock("./io.js", () => ({
  init: initIo,
  dispose: disposeIo,
  isActive: vi.fn(() => false),
  restore,
}));
vi.mock("./context-menu.js", () => ({ init: initMenu, dispose: disposeMenu }));
// Uses "insert-child" rather than "notes" because TopBar's notes button
// no longer goes through this delegation (see CLAUDE.md, Workspace
// shared-chrome refactor) — it calls command/command.js's execute()
// directly instead, since it now lives outside this container. The
// remaining real consumer of this click delegation is ContextMenu.jsx's
// data-command buttons, so this test uses one of its command ids.
vi.mock("../command/command.js", () => ({
  repo: new Map([["insert-child", { execute }]]),
}));
vi.mock("../store.js", () => ({
  lastSaveTime: vi.fn(() => null),
  toggleRightPanel: vi.fn(),
  activeMode: vi.fn(() => "canvas"),
}));

const ui = await import("./ui.js");
const { activeMode } = await import("../store.js");

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

describe("ui click delegation scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.Element = class Element {};
    globalThis.HTMLInputElement = class HTMLInputElement {};
    globalThis.HTMLSelectElement = class HTMLSelectElement {};
    globalThis.HTMLTextAreaElement = class HTMLTextAreaElement {};
    globalThis.document = {
      activeElement: null,
      querySelector: vi.fn(() => ({ textContent: "" })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  it("registers delegated command clicks on the provided container", () => {
    const port = eventTarget();
    const container = eventTarget();
    const documentAdd = document.addEventListener;
    const documentRemove = document.removeEventListener;
    const button = Object.assign(new Element(), {
      dataset: { command: "insert-child" },
      parentNode: null,
    });

    ui.init(port, container);

    expect(initMenu).toHaveBeenCalledWith(port);
    expect(container.addEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
    );
    expect(documentAdd).not.toHaveBeenCalledWith("click", expect.any(Function));

    container.dispatch("click", { target: button });
    expect(execute).toHaveBeenCalledOnce();

    ui.dispose(container);

    expect(container.removeEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
    );
    expect(documentRemove).not.toHaveBeenCalledWith(
      "click",
      expect.any(Function),
    );
  });
  it("ignores delegated clicks while the canvas is backgrounded", () => {
    const port = eventTarget();
    const container = eventTarget();
    const button = Object.assign(new Element(), {
      dataset: { command: "insert-child" },
      parentNode: null,
    });

    ui.init(port, container);
    activeMode.mockReturnValueOnce("notes");

    container.dispatch("click", { target: button });
    expect(execute).not.toHaveBeenCalled();

    ui.dispose(container);
  });
});
