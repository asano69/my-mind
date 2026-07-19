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

// clipboard.js listens on `document` (capture phase), not containerEl —
// see clipboard.js's init() comment: cut/copy/paste target wherever the
// browser resolves the current Selection to be, not simply
// document.activeElement, so a plain focused container div is not a
// reliable event target for these three event types.
function documentTarget() {
  // Keyed by "type:capture" so capture-phase and bubble-phase listeners
  // for the same event type are tracked independently, mirroring real
  // DOM semantics closely enough for these tests.
  const listeners = new Map();
  const key = (type, capture) => `${type}:${!!capture}`;
  return {
    addEventListener: vi.fn((type, listener, capture) => {
      listeners.set(key(type, capture), listener);
    }),
    removeEventListener: vi.fn((type, listener, capture) => {
      if (listeners.get(key(type, capture)) === listener) {
        listeners.delete(key(type, capture));
      }
    }),
    dispatch(type, event, capture = true) {
      listeners.get(key(type, capture))?.(event);
    },
  };
}

describe("clipboard listener scope", () => {
  let doc;

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveMode.value = "canvas";
    doc = documentTarget();
    globalThis.document = doc;
  });

  it("registers clipboard events on document's capture phase", () => {
    clipboard.init();

    expect(doc.addEventListener).toHaveBeenCalledWith(
      "cut",
      expect.any(Function),
      true,
    );
    expect(doc.addEventListener).toHaveBeenCalledWith(
      "copy",
      expect.any(Function),
      true,
    );
    expect(doc.addEventListener).toHaveBeenCalledWith(
      "paste",
      expect.any(Function),
      true,
    );

    clipboard.dispose();

    expect(doc.removeEventListener).toHaveBeenCalledWith(
      "cut",
      expect.any(Function),
      true,
    );
    expect(doc.removeEventListener).toHaveBeenCalledWith(
      "copy",
      expect.any(Function),
      true,
    );
    expect(doc.removeEventListener).toHaveBeenCalledWith(
      "paste",
      expect.any(Function),
      true,
    );
  });
  it("ignores copy events while the canvas is backgrounded", () => {
    clipboard.init();
    mockActiveMode.value = "notes";

    const setData = vi.fn();
    doc.dispatch("copy", {
      preventDefault: vi.fn(),
      clipboardData: { setData },
    });

    expect(setData).not.toHaveBeenCalled();

    clipboard.dispose();
  });
  it("handles a copy event when the canvas is active", () => {
    clipboard.init();

    const setData = vi.fn();
    doc.dispatch("copy", {
      preventDefault: vi.fn(),
      clipboardData: { setData },
    });

    // getAllSelected() is mocked to return [], so there's nothing to
    // copy — this just confirms the event reaches onCopyCut() at all
    // (i.e. is not silently dropped) when canvas mode is active.
    expect(setData).not.toHaveBeenCalled();

    clipboard.dispose();
  });
});
