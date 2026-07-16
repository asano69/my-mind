import { describe, expect, it, vi } from "vitest";

function classList() {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    toggle: vi.fn(),
  };
}

function node() {
  const attrs = new Map();
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

vi.mock("./html.js", () => ({ node }));
vi.mock("./svg.js", () => ({ group: node, foreignObject: node, node }));
vi.mock("./pubsub.js", () => ({ publish: vi.fn() }));
vi.mock("./my-mind.js", () => ({ selectItem: vi.fn() }));
vi.mock("./command/command.js", () => ({ repo: { get: vi.fn() } }));
vi.mock("./shape/shape.js", () => ({ repo: { get: (id) => ({ id }) } }));
vi.mock("./layout/layout.js", () => ({ repo: { get: (id) => ({ id }) } }));
vi.mock("./map.js", () => ({ default: class Map {} }));

const { default: Item } = await import("./item.js");

describe("Item resolved layout memo", () => {
  it("does not throw when a detached subtree invalidates descendant layout", () => {
    const root = new Item();
    const child = new Item();
    const grandchild = new Item();

    root.layout = { id: "map" };
    child.parent = root;
    grandchild.parent = child;

    expect(grandchild.resolvedLayout.id).toBe("map");
    expect(() => {
      child.parent = null;
    }).not.toThrow();
  });
});
