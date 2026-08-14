import { describe, it, expect, vi } from "vitest";

// Regression test for Phase 7 of the Solid migration (see CLAUDE.md):
// confirms action.js's do()/undo() model still works correctly now that
// item.js's properties are signal-backed (Phase 6). Item's constructor
// touches DOM/SVG node creation, so this reuses item.test.js's DOM-free
// mocking approach.

function classList() {
  return { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
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

vi.mock("solid-js", async () => await import("solid-js/dist/solid.js"));
vi.mock("./html.js", () => ({ node }));
vi.mock("./svg.js", () => ({ group: node, foreignObject: node, node }));
vi.mock("./pubsub.js", () => ({ publish: vi.fn() }));
vi.mock("./my-mind.js", () => ({ selectItem: vi.fn() }));
vi.mock("./command/command.js", () => ({ repo: { get: vi.fn() } }));
vi.mock("./shape/shape.js", () => ({
  repo: { get: (id) => ({ id, update: vi.fn() }) },
}));
vi.mock("./layout/layout.js", () => ({ repo: { get: (id) => ({ id }) } }));
vi.mock("./map.js", () => ({ default: class Map {} }));

const { default: Item } = await import("./item.js");
const { SetStatus, SetValue, SetColor, SetUrl, InsertNewItem } =
  await import("./action.js");

describe("action do()/undo() against signal-backed Item properties", () => {
  it("SetStatus: do()/undo() round-trip the signal and its resolved memo", () => {
    const item = new Item();
    const action = new SetStatus(item, true);
    action.do();
    expect(item.status).toBe(true);
    expect(item.resolvedStatus).toBe(true);
    action.undo();
    expect(item.status).toBe(null);
    expect(item.resolvedStatus).toBe(null);
  });

  it("SetValue: do()/undo() round-trip the signal and its resolved memo", () => {
    const item = new Item();
    const action = new SetValue(item, 5);
    action.do();
    expect(item.value).toBe(5);
    expect(item.resolvedValue).toBe(5);
    action.undo();
    expect(item.value).toBe(null);
  });

  it("SetColor: do()/undo() round-trip the signal, resolvedColor follows", () => {
    const item = new Item();
    const action = new SetColor(item, "#d33");
    action.do();
    expect(item.color).toBe("#d33");
    expect(item.resolvedColor).toBe("#d33");
    action.undo();
    expect(item.color).toBe("");
    expect(item.resolvedColor).toBe("#999"); // default COLOR in item.js
  });

  it("SetUrl: do()/undo() round-trip the signal", () => {
    const item = new Item();
    const action = new SetUrl(item, "https://example.com");
    action.do();
    expect(item.url).toBe("https://example.com");
    action.undo();
    expect(item.url).toBe("");
  });
});

describe("InsertNewItem shape inheritance", () => {
  it("gives a new sibling the same explicit shape when every existing sibling agrees", () => {
    const parent = new Item();
    const boxShape = { id: "box", update: vi.fn() };
    const child1 = new Item();
    child1.shape = boxShape;
    const child2 = new Item();
    child2.shape = boxShape;
    parent.insertChild(child1);
    parent.insertChild(child2);

    const action = new InsertNewItem(parent, parent.children.length);

    expect(action.item.shape).toBe(boxShape);
  });

  it("leaves shape unset when siblings disagree", () => {
    const parent = new Item();
    const child1 = new Item();
    child1.shape = { id: "box", update: vi.fn() };
    const child2 = new Item();
    child2.shape = { id: "ellipse", update: vi.fn() };
    parent.insertChild(child1);
    parent.insertChild(child2);

    const action = new InsertNewItem(parent, parent.children.length);

    expect(action.item.shape).toBe(null);
  });

  it("leaves shape unset when a sibling has no explicit shape at all", () => {
    const parent = new Item();
    const child1 = new Item();
    child1.shape = { id: "box", update: vi.fn() };
    const child2 = new Item(); // no explicit shape
    parent.insertChild(child1);
    parent.insertChild(child2);

    const action = new InsertNewItem(parent, parent.children.length);

    expect(action.item.shape).toBe(null);
  });

  it("inherits the single existing sibling's explicit shape", () => {
    const parent = new Item();
    const child1 = new Item();
    child1.shape = { id: "box", update: vi.fn() };
    parent.insertChild(child1);

    const action = new InsertNewItem(parent, parent.children.length);

    expect(action.item.shape).toBe(child1.shape);
  });
});
