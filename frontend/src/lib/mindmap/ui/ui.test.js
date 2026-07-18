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
vi.mock("../command/command.js", () => ({
  repo: new Map([["notes", { execute }]]),
}));
vi.mock("../store.js", () => ({
  lastSaveTime: vi.fn(() => null),
  toggleRightPanel: vi.fn(),
}));

const ui = await import("./ui.js");

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
      dataset: { command: "notes" },
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
});
