import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  registerDomRefs,
  startEditing,
  commitEditing,
  discardEditing,
  isEditing,
} from "./newEdit.js";
import * as history from "./history.js";

// Plain stub mimicking the DOM API newEdit.js touches on an item's
// ".text" element -- no real DOM needed, matching the stub pattern used
// throughout this codebase's other vanilla-module tests (see
// keyboard.test.js's eventTarget(), mouse.test.js's contentNode()).
function textStub(html = "") {
  const listeners = new Map();
  return {
    innerHTML: html,
    textContent: html,
    contentEditable: "false",
    focus: vi.fn(),
    blur: vi.fn(),
    addEventListener: vi.fn((type, fn) => listeners.set(type, fn)),
    removeEventListener: vi.fn((type, fn) => {
      if (listeners.get(type) === fn) {
        listeners.delete(type);
      }
    }),
    dispatch(type, e) {
      listeners.get(type)?.(e);
    },
  };
}

// Stub for the ".content" element domRefs actually registers (see
// NewMindMapPreview.jsx's registerDomRef) -- newEdit.js locates the
// text element via content.querySelector(".text").
function contentStub(html = "") {
  const text = textStub(html);
  return {
    text,
    offsetWidth: 100,
    scrollWidth: 100,
    offsetHeight: 20,
    scrollHeight: 20,
    querySelector: (sel) => (sel === ".text" ? text : null),
  };
}

function itemStub(id, text = "") {
  return {
    id,
    text,
    url: "",
    setMeasuredSize: vi.fn(),
    defaultContentSize: () => [150, 44],
  };
}

describe("newEdit.js", () => {
  beforeEach(() => {
    globalThis.document = { execCommand: vi.fn() };
    registerDomRefs(null);
    // commitEditing() now pushes a SetText action onto history.js's
    // shared undo stack (Phase 4.6, see newAction.js) -- reset it so
    // one test's edit never leaks into the next test's canBack()/
    // canForward() state.
    history.reset();
  });

  it("returns null when the item has no registered DOM ref", () => {
    registerDomRefs(new Map());
    const item = itemStub("a", "hello");
    expect(startEditing(item)).toBeNull();
    expect(isEditing(item)).toBe(false);
  });

  it("enables contentEditable and focuses the text element", () => {
    const item = itemStub("a", "hello");
    const content = contentStub("hello");
    registerDomRefs(new Map([["a", content]]));

    const el = startEditing(item);

    expect(el).toBe(content.text);
    expect(content.text.contentEditable).toBe("true");
    expect(content.text.focus).toHaveBeenCalledOnce();
    expect(isEditing(item)).toBe(true);
  });

  it("commitEditing writes the edited HTML back to item.text and remeasures", () => {
    const item = itemStub("a", "hello");
    const content = contentStub("hello");
    registerDomRefs(new Map([["a", content]]));
    startEditing(item);
    content.text.innerHTML = "hello world";

    commitEditing(item);

    expect(item.text).toBe("hello world");
    expect(content.text.contentEditable).toBe("false");
    expect(item.setMeasuredSize).toHaveBeenCalledWith([100, 20]);
    expect(isEditing(item)).toBe(false);
  });

  it("discardEditing restores the DOM to the item's last-committed text", () => {
    const item = itemStub("a", "original");
    const content = contentStub("original");
    registerDomRefs(new Map([["a", content]]));
    startEditing(item);
    content.text.innerHTML = "unsaved edit";

    discardEditing(item);

    expect(content.text.innerHTML).toBe("original");
    expect(item.text).toBe("original"); // untouched
    expect(isEditing(item)).toBe(false);
  });

  it("commitEditing/discardEditing are no-ops for an item that isn't being edited", () => {
    const item = itemStub("a", "hello");
    registerDomRefs(new Map());
    expect(() => commitEditing(item)).not.toThrow();
    expect(() => discardEditing(item)).not.toThrow();
    expect(item.text).toBe("hello");
  });

  it("Tab is prevented while editing", () => {
    const item = itemStub("a", "hello");
    const content = contentStub("hello");
    registerDomRefs(new Map([["a", content]]));
    startEditing(item);

    const preventDefault = vi.fn();
    content.text.dispatch("keydown", { code: "Tab", preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("pasting a URL that becomes the item's entire content sets item.url", async () => {
    const item = itemStub("a", "");
    const content = contentStub("");
    registerDomRefs(new Map([["a", content]]));
    startEditing(item);
    content.text.textContent = "https://example.com";

    content.text.dispatch("paste", {
      clipboardData: { getData: () => "https://example.com" },
    });
    await Promise.resolve(); // flush the queueMicrotask

    expect(item.url).toBe("https://example.com");
  });

  it("pasting a URL into non-empty text does not set item.url", async () => {
    const item = itemStub("a", "");
    const content = contentStub("");
    registerDomRefs(new Map([["a", content]]));
    startEditing(item);
    // Final text ends up longer than just the pasted URL.
    content.text.textContent = "see https://example.com here";

    content.text.dispatch("paste", {
      clipboardData: { getData: () => "https://example.com" },
    });
    await Promise.resolve();

    expect(item.url).toBe("");
  });
});
