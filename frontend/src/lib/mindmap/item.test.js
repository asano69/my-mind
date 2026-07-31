import { describe, expect, it, vi } from "vitest";

function classList() {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    toggle: vi.fn(),
  };
}

function node() {
  const attrs = new globalThis.Map();
  return {
    classList: classList(),
    dataset: {},
    style: {},
    hidden: false,
    innerHTML: "",
    textContent: "",
    contentEditable: "",
    offsetWidth: 0,
    scrollWidth: 0,
    offsetHeight: 0,
    scrollHeight: 0,
    parentNode: null,
    append(...children) {
      children.forEach((child) => {
        child.parentNode = this;
      });
    },
    appendChild(child) {
      child.parentNode = this;
    },
    insertBefore(child) {
      child.parentNode = this;
    },
    remove: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    querySelector: () => ({ setAttribute: vi.fn() }),
    setAttribute(name, value) {
      attrs.set(name, value);
    },
    getAttribute(name) {
      return attrs.get(name) ?? "0";
    },
    getBBox: () => ({ width: 0, height: 0 }),
  };
}

vi.mock("solid-js", async () => await import("solid-js/dist/solid.js"));
vi.mock("./html.js", () => ({ node }));
vi.mock("./svg.js", () => ({ group: node, foreignObject: node, node }));
vi.mock("./pubsub.js", () => ({ publish: vi.fn() }));
vi.mock("./my-mind.js", () => ({ selectItem: vi.fn() }));
vi.mock("./command/command.js", () => ({ repo: { get: vi.fn() } }));
vi.mock("./shape/shape.js", () => ({
  repo: { get: (id) => ({ id, update: vi.fn() }) },
}));
vi.mock("./layout/layout.js", () => ({
  repo: {
    get: (id) => ({ id, computeAlignment: () => "left", update: vi.fn() }),
  },
}));
vi.mock("./map.js", () => ({ default: class Map {} }));

const { createSignal } = await import("solid-js");
const { default: Map } = await import("./map.js");
const { default: Item } = await import("./item.js");

describe("Item resolved layout memo", () => {
  it("does not throw when a detached subtree invalidates descendant layout", () => {
    const root = new Item();
    const child = new Item();
    const grandchild = new Item();

    root.layout = {
      id: "map",
      computeAlignment: () => "left",
      update: vi.fn(),
    };
    child.parent = root;
    grandchild.parent = child;

    expect(grandchild.resolvedLayout.id).toBe("map");
    expect(() => {
      child.parent = null;
    }).not.toThrow();
  });
});

describe("Item resolved value/status memos", () => {
  it("tracks children inserted after computed value/status is selected", () => {
    const parent = new Item();
    parent.value = "sum";
    parent.status = "computed";

    expect(parent.resolvedValue).toBe(0);
    expect(parent.resolvedStatus).toBe(true);

    const child = new Item();
    child.value = 3;
    child.status = false;
    parent.insertChild(child);

    expect(parent.resolvedValue).toBe(3);
    expect(parent.resolvedStatus).toBe(false);
  });
});

describe("Item layout result memo", () => {
  function instrumentLayout(item) {
    const calls = { update: 0, measure: 0, write: 0 };
    item._updateLayoutContent = vi.fn(() => {
      calls.update++;
      item._text();
    });
    item._measureOwnContent = vi.fn(() => {
      calls.measure++;
    });
    item._writeOwnLayout = vi.fn(() => {
      calls.write++;
    });
    return calls;
  }

  it("returns the item size after running the per-item layout steps", () => {
    const map = new Map();
    const item = new Item();
    item.parent = map;
    item.dom.node.getBBox = () => ({ width: 42, height: 24 });
    const calls = instrumentLayout(item);
    item.layout = {
      id: "map",
      computeAlignment: () => "left",
      update: vi.fn(),
    };

    expect(item._layoutResult()).toEqual([42, 24]);
    expect(calls).toEqual({ update: 1, measure: 1, write: 1 });
  });

  it("recomputes the changed child and ancestors without unrelated siblings", () => {
    const map = new Map();
    const root = new Item();
    const child = new Item();
    const sibling = new Item();
    root.parent = map;
    root.insertChild(child);
    root.insertChild(sibling);

    const rootCalls = instrumentLayout(root);
    const childCalls = instrumentLayout(child);
    const siblingCalls = instrumentLayout(sibling);
    root.layout = {
      id: "map",
      computeAlignment: () => "left",
      update: vi.fn(),
    };

    root._layoutResult();
    expect(rootCalls.update).toBe(1);
    expect(childCalls.update).toBe(1);
    expect(siblingCalls.update).toBe(1);

    child.text = "changed";
    root._layoutResult();

    expect(rootCalls.update).toBe(2);
    expect(childCalls.update).toBe(2);
    expect(siblingCalls.update).toBe(1);
  });

  it("uses item-local versions for side changes and live content input", () => {
    const map = new Map();
    map.ensureItemVisibility = vi.fn();
    const root = new Item();
    const child = new Item();
    const sibling = new Item();
    root.parent = map;
    root.insertChild(child);
    root.insertChild(sibling);

    const rootCalls = instrumentLayout(root);
    const childCalls = instrumentLayout(child);
    const siblingCalls = instrumentLayout(sibling);
    root.layout = {
      id: "map",
      computeAlignment: () => "left",
      update: vi.fn(),
    };

    root._layoutResult();
    child.side = "left";
    root._layoutResult();

    expect(rootCalls.update).toBe(2);
    expect(childCalls.update).toBe(2);
    expect(siblingCalls.update).toBe(1);

    child.handleEvent({ type: "input" });
    root._layoutResult();

    expect(rootCalls.update).toBe(3);
    expect(childCalls.update).toBe(3);
    expect(siblingCalls.update).toBe(1);
    expect(map.ensureItemVisibility).toHaveBeenCalledWith(child);
  });

  it("uses map font-size version as an intentional whole-tree trigger", () => {
    const map = new Map();
    const [fontSizeVersion, setFontSizeVersion] = createSignal(0);
    map._fontSizeVersion = fontSizeVersion;
    map._bumpFontSizeVersion = () =>
      setFontSizeVersion((version) => version + 1);
    const root = new Item();
    const child = new Item();
    const sibling = new Item();
    root.parent = map;
    root.insertChild(child);
    root.insertChild(sibling);

    const rootCalls = instrumentLayout(root);
    const childCalls = instrumentLayout(child);
    const siblingCalls = instrumentLayout(sibling);
    root.layout = {
      id: "map",
      computeAlignment: () => "left",
      update: vi.fn(),
    };

    root._layoutResult();
    map._bumpFontSizeVersion();
    root._layoutResult();

    expect(rootCalls.update).toBe(2);
    expect(childCalls.update).toBe(2);
    expect(siblingCalls.update).toBe(2);
  });

  it("does not layout descendants of a detached subtree with stale inherited layout", () => {
    const map = new Map();
    const root = new Item();
    const child = new Item();
    const grandchild = new Item();
    root.parent = map;
    root.insertChild(child);
    child.insertChild(grandchild);

    const grandchildCalls = instrumentLayout(grandchild);
    root.layout = {
      id: "map",
      computeAlignment: () => "left",
      update: vi.fn(),
    };

    root._layoutResult();
    expect(grandchildCalls.update).toBe(1);

    child.parent = null;
    expect(() => grandchild._layoutResult()).not.toThrow();
    expect(grandchildCalls.update).toBe(1);
  });

  it("does not read child layout memos while collapsed", () => {
    const map = new Map();
    const root = new Item();
    const child = new Item();
    root.parent = map;
    root.insertChild(child);

    const rootCalls = instrumentLayout(root);
    const childCalls = instrumentLayout(child);
    root.layout = {
      id: "map",
      computeAlignment: () => "left",
      update: vi.fn(),
    };
    rootCalls.update = 0;
    rootCalls.measure = 0;
    rootCalls.write = 0;
    childCalls.update = 0;
    childCalls.measure = 0;
    childCalls.write = 0;
    root.collapsed = true;

    root._layoutResult();

    expect(rootCalls.update).toBe(1);
    expect(childCalls.update).toBe(0);
  });
});
