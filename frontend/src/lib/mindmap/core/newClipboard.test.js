import { beforeEach, describe, expect, it, vi } from "vitest";

// Mirrors clipboard.test.js's mocking strategy, adapted for the new
// engine's modules (itemSelection.js instead of my-mind.js's app.*,
// newAction.js instead of action.js, no ui/ui.js equivalent -- see
// newClipboard.js's `editing()` guard, which replaces the old engine's
// `ui.isActive() || app.editing` combination).
const mockActiveMode = { value: "canvas" };
vi.mock("./store.js", () => ({ activeMode: () => mockActiveMode.value }));

vi.mock("./newAction.js", () => ({
  action: vi.fn(),
  MoveItem: class MoveItem {
    constructor(item, target) {
      this.item = item;
      this.target = target;
    }
  },
  AppendItem: class AppendItem {
    constructor(parent, item) {
      this.parent = parent;
      this.item = item;
    }
  },
  Multi: class Multi {
    constructor(actions) {
      this.actions = actions;
    }
  },
}));

// The mock's `default` export matters here even though this test only
// ever calls `formatRepo.get(...)` directly: format/format.js's own
// module is unconditionally imported (for its `Format` base class) by
// format/plaintext.js, which in turn is imported by my-mind.js as a
// side-effect registration (`new Plaintext()`). If anything else in the
// same test run pulls in the real (unmocked) my-mind.js/action.js chain
// -- e.g. a sibling test file that exercises newAction.js without
// mocking it -- that real plaintext.js resolves this file's mock of
// "./format/format.js" and needs a usable `default` to extend, or the
// module throws at evaluation time instead of at any assertion. A
// trivial placeholder class keeps this mock self-contained regardless
// of what else is loaded in the same run.
vi.mock("./format/format.js", () => ({
  default: class {},
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

// itemStore.js (ItemNode) is used for real -- toJSON()/fromJSON()/
// clone() don't touch the DOM, matching newAction.test.js's own choice
// to exercise ItemNode directly rather than stubbing it.
import "./shape/box.js";
import "./shape/ellipse.js";
import "./shape/underline.js";
import "./layout/graph.js";
import "./layout/tree.js";
import "./layout/map.js";
import ItemNode from "./itemStore.js";

const newClipboard = await import("./newClipboard.js");
const {
  currentItem,
  setCurrentItem,
  selectedItems,
  setSelectedItems,
  editing,
  setEditing,
} = await import("./itemSelection.js");
const {
  action: actionFn,
  MoveItem,
  AppendItem,
  Multi,
} = await import("./newAction.js");
const { repo: formatRepo } = await import("./format/format.js");

// documentTarget: same capture/bubble-keyed listener stub as
// clipboard.test.js's own helper, since newClipboard.js listens on
// `document` in the same way for the same reasons (see
// docs/d01-clipboard-event-targeting.md).
function documentTarget() {
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
      // newClipboard.js's onCopyCut() switches on e.type (mirroring a
      // real browser Event's own .type field) to distinguish "copy"
      // from "cut" -- without this, every dispatched event fell through
      // to the switch's default case and silently no-op'd.
      listeners.get(key(type, capture))?.({ ...event, type });
    },
  };
}

function resetSelectionState() {
  setCurrentItem(null);
  setSelectedItems(new Set());
  setEditing(false);
}

function domNode() {
  return { classList: { add: vi.fn(), remove: vi.fn() } };
}

describe("newClipboard.js listener scope", () => {
  let doc;

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveMode.value = "canvas";
    resetSelectionState();
    doc = documentTarget();
    globalThis.document = doc;
  });

  it("registers clipboard events on document's capture phase", () => {
    newClipboard.init();

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

    newClipboard.dispose();

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
    newClipboard.init();
    mockActiveMode.value = "notes";
    setCurrentItem(new ItemNode());

    const setData = vi.fn();
    doc.dispatch("copy", {
      preventDefault: vi.fn(),
      clipboardData: { setData },
    });

    expect(setData).not.toHaveBeenCalled();
    newClipboard.dispose();
  });

  it("ignores copy events while editing", () => {
    newClipboard.init();
    setCurrentItem(new ItemNode());
    setEditing(true);

    const setData = vi.fn();
    doc.dispatch("copy", {
      preventDefault: vi.fn(),
      clipboardData: { setData },
    });

    expect(setData).not.toHaveBeenCalled();
    newClipboard.dispose();
  });

  it("does nothing on copy when nothing is selected (currentItem is null)", () => {
    newClipboard.init();

    const setData = vi.fn();
    doc.dispatch("copy", {
      preventDefault: vi.fn(),
      clipboardData: { setData },
    });

    expect(setData).not.toHaveBeenCalled();
    newClipboard.dispose();
  });
});

describe("newClipboard.js copy/cut", () => {
  let doc;

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveMode.value = "canvas";
    resetSelectionState();
    doc = documentTarget();
    globalThis.document = doc;
  });

  it("copy clones the selected item and writes plaintext to the clipboard", () => {
    const domRefs = new Map();
    newClipboard.init(domRefs);
    const root = new ItemNode();
    const item = new ItemNode();
    item.text = "hello";
    root.insertChild(item); // must be non-root for onCopyCut()'s isRoot filter to include it
    setCurrentItem(item);
    formatRepo.get("plaintext").to.mockReturnValue("plaintext-output");

    const setData = vi.fn();
    doc.dispatch("copy", {
      preventDefault: vi.fn(),
      clipboardData: { setData },
    });

    expect(formatRepo.get("plaintext").to).toHaveBeenCalled();
    expect(setData).toHaveBeenCalledWith("text/plain", "plaintext-output");
    newClipboard.dispose();
  });

  it("cut adds the .cut class via domRefs to every selected non-root item", () => {
    const root = new ItemNode();
    const item = new ItemNode();
    root.insertChild(item); // must be non-root for onCopyCut()'s isRoot filter to include it
    const el = domNode();
    const domRefs = new Map([[item.id, el]]);
    newClipboard.init(domRefs);
    setCurrentItem(item);

    doc.dispatch("cut", {
      preventDefault: vi.fn(),
      clipboardData: { setData: vi.fn() },
    });

    expect(el.classList.add).toHaveBeenCalledWith("cut");
    newClipboard.dispose();
  });

  it("excludes the root item from copy/cut", () => {
    const root = new ItemNode(); // isRoot === true (no parent)
    newClipboard.init();
    setCurrentItem(root);

    const setData = vi.fn();
    doc.dispatch("copy", {
      preventDefault: vi.fn(),
      clipboardData: { setData },
    });

    expect(setData).not.toHaveBeenCalled();
    newClipboard.dispose();
  });
});

describe("newClipboard.js paste", () => {
  let doc;

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveMode.value = "canvas";
    resetSelectionState();
    doc = documentTarget();
    globalThis.document = doc;
  });

  it("does nothing when there is no target item selected", () => {
    newClipboard.init();

    doc.dispatch("paste", {
      preventDefault: vi.fn(),
      clipboardData: { getData: () => "some text" },
    });

    expect(actionFn).not.toHaveBeenCalled();
    newClipboard.dispose();
  });

  it("internal cut-paste dispatches a MoveItem to the target", () => {
    const root = new ItemNode();
    const source = new ItemNode();
    root.insertChild(source);
    const target = new ItemNode();
    root.insertChild(target);
    formatRepo.get("plaintext").to.mockReturnValue("copied-text");

    newClipboard.init();
    setCurrentItem(source);
    doc.dispatch("cut", {
      preventDefault: vi.fn(),
      clipboardData: { setData: vi.fn() },
    });

    setCurrentItem(target);
    doc.dispatch("paste", {
      preventDefault: vi.fn(),
      clipboardData: { getData: () => "copied-text" },
    });

    expect(actionFn).toHaveBeenCalledOnce();
    const dispatched = actionFn.mock.calls[0][0];
    expect(dispatched).toBeInstanceOf(MoveItem);
    expect(dispatched.item).toBe(source);
    expect(dispatched.target).toBe(target);
    newClipboard.dispose();
  });

  it("internal cut-paste rejects a drop onto the item's own descendant", () => {
    const root = new ItemNode();
    const source = new ItemNode();
    root.insertChild(source);
    const descendant = new ItemNode();
    source.insertChild(descendant);
    formatRepo.get("plaintext").to.mockReturnValue("copied-text");

    newClipboard.init();
    setCurrentItem(source);
    doc.dispatch("cut", {
      preventDefault: vi.fn(),
      clipboardData: { setData: vi.fn() },
    });

    setCurrentItem(descendant);
    doc.dispatch("paste", {
      preventDefault: vi.fn(),
      clipboardData: { getData: () => "copied-text" },
    });

    expect(actionFn).not.toHaveBeenCalled();
    newClipboard.dispose();
  });

  it("internal copy-paste dispatches an AppendItem with a fresh clone", () => {
    const target = new ItemNode();
    const sourceRoot = new ItemNode();
    const source = new ItemNode();
    source.text = "copied";
    sourceRoot.insertChild(source); // must be non-root for onCopyCut()'s isRoot filter to include it
    formatRepo.get("plaintext").to.mockReturnValue("copied-text");

    newClipboard.init();
    setCurrentItem(source);
    doc.dispatch("copy", {
      preventDefault: vi.fn(),
      clipboardData: { setData: vi.fn() },
    });

    setCurrentItem(target);
    doc.dispatch("paste", {
      preventDefault: vi.fn(),
      clipboardData: { getData: () => "copied-text" },
    });

    expect(actionFn).toHaveBeenCalledOnce();
    const dispatched = actionFn.mock.calls[0][0];
    expect(dispatched).toBeInstanceOf(AppendItem);
    expect(dispatched.parent).toBe(target);
    expect(dispatched.item).not.toBe(source); // clone, not the original
    expect(dispatched.item.text).toBe("copied");
    newClipboard.dispose();
  });

  it("external plaintext paste (no stored items) builds items via format/plaintext.js and dispatches Multi", () => {
    const target = new ItemNode();
    newClipboard.init();
    setCurrentItem(target);

    doc.dispatch("paste", {
      preventDefault: vi.fn(),
      clipboardData: { getData: () => "external text" },
    });

    expect(formatRepo.get("plaintext").from).toHaveBeenCalledWith(
      "external text",
    );
    expect(actionFn).toHaveBeenCalledOnce();
    expect(actionFn.mock.calls[0][0]).toBeInstanceOf(Multi);
    newClipboard.dispose();
  });

  it("clears the .cut class via domRefs once the cut item is pasted", () => {
    const root = new ItemNode();
    const source = new ItemNode();
    root.insertChild(source);
    const target = new ItemNode();
    root.insertChild(target);
    const el = domNode();
    const domRefs = new Map([[source.id, el]]);
    formatRepo.get("plaintext").to.mockReturnValue("copied-text");

    newClipboard.init(domRefs);
    setCurrentItem(source);
    doc.dispatch("cut", {
      preventDefault: vi.fn(),
      clipboardData: { setData: vi.fn() },
    });
    expect(el.classList.add).toHaveBeenCalledWith("cut");

    setCurrentItem(target);
    doc.dispatch("paste", {
      preventDefault: vi.fn(),
      clipboardData: { getData: () => "copied-text" },
    });

    expect(el.classList.remove).toHaveBeenCalledWith("cut");
    newClipboard.dispose();
  });
});
