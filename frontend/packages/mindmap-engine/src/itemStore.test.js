import { describe, it, expect, vi } from "vitest";

// Use the synchronous dist build (same workaround as item.test.js/
// action.item.test.js/title.test.js) so a memo's recomputation is
// visible to a plain synchronous read immediately after the signal
// write that invalidated it. The default "solid-js" export schedules
// some of this work on a microtask, which this file's synchronous
// assertions (write an ancestor's signal, then immediately read a
// descendant memo) can't observe.
vi.mock("solid-js", async () => await import("solid-js/dist/solid.js"));

// Registers shape/layout kinds into their repos (see shape/shape.js's
// and layout/layout.js's `repo` Maps), the same side-effect-import
// pattern my-mind.js uses to wire the engine together -- needed here so
// fromJSON() round trips below can resolve "box"/"map" ids back to real
// instances. None of these modules touch the DOM at import time (only
// inside their update() methods, which this test never calls), so no
// DOM stubbing is needed, unlike item.test.js.
import "./shape/box.js";
import "./shape/ellipse.js";
import "./shape/underline.js";
import "./layout/graph.js";
import "./layout/tree.js";
import "./layout/map.js";

import ItemNode from "./itemStore.js";
import { repo as shapeRepo } from "./shape/shape.js";
import { repo as layoutRepo } from "./layout/layout.js";

describe("ItemNode inheritance memos", () => {
  it("resolvedColor/resolvedTextColor fall through to the nearest explicit ancestor", () => {
    const root = new ItemNode();
    const child = new ItemNode();
    const grandchild = new ItemNode();
    root.insertChild(child);
    child.insertChild(grandchild);

    expect(root.resolvedColor).toBe("#999");
    root.color = "#d33";
    expect(child.resolvedColor).toBe("#d33");
    expect(grandchild.resolvedColor).toBe("#d33");

    child.color = "#3d3";
    expect(grandchild.resolvedColor).toBe("#3d3");
    expect(root.resolvedColor).toBe("#d33"); // unaffected by descendant

    expect(root.resolvedTextColor).toBe("");
    root.textColor = "#000";
    expect(grandchild.resolvedTextColor).toBe("#000");
  });

  it("resolvedShape defaults by depth but is never inherited from an ancestor's explicit shape", () => {
    const root = new ItemNode();
    const child = new ItemNode();
    const grandchild = new ItemNode();
    root.insertChild(child);
    child.insertChild(grandchild);

    expect(root.resolvedShape.id).toBe("ellipse");
    expect(child.resolvedShape.id).toBe("box");
    expect(grandchild.resolvedShape.id).toBe("underline");

    root.shape = shapeRepo.get("underline");
    expect(root.resolvedShape.id).toBe("underline");
    // child's own resolved shape is untouched by root's explicit shape.
    expect(child.resolvedShape.id).toBe("box");
  });

  it("resolvedLayout inherits down the parent chain and throws when disconnected", () => {
    const root = new ItemNode();
    const child = new ItemNode();
    root.insertChild(child);

    expect(() => child.resolvedLayout).toThrow(
      "Non-connected item does not have layout",
    );

    root.layout = layoutRepo.get("map");
    expect(child.resolvedLayout.id).toBe("map");

    child.parent = null;
    expect(() => child.resolvedLayout).toThrow();
  });
});

describe("ItemNode resolved value/status aggregation", () => {
  it("recomputes sum/avg/min/max from children, tracking children added later", () => {
    const parent = new ItemNode();
    parent.value = "sum";
    expect(parent.resolvedValue).toBe(0); // no children yet

    const a = new ItemNode();
    a.value = 3;
    const b = new ItemNode();
    b.value = 4;
    parent.insertChild(a);
    parent.insertChild(b);
    expect(parent.resolvedValue).toBe(7);

    parent.value = "avg";
    expect(parent.resolvedValue).toBe(3.5);
  });

  it("resolves 'computed' status as true unless any child is explicitly false", () => {
    const parent = new ItemNode();
    parent.status = "computed";
    expect(parent.resolvedStatus).toBe(true); // no children yet

    const a = new ItemNode();
    a.status = true;
    parent.insertChild(a);
    expect(parent.resolvedStatus).toBe(true);

    const b = new ItemNode();
    b.status = false;
    parent.insertChild(b);
    expect(parent.resolvedStatus).toBe(false);
  });
});

describe("ItemNode.collapsed", () => {
  it("is a plain reactive boolean, with no DOM side effects to trigger", () => {
    const item = new ItemNode();
    expect(item.collapsed).toBe(false);
    item.collapsed = true;
    expect(item.collapsed).toBe(true);
  });
});

describe("ItemNode tree mutation", () => {
  it("insertChild reparents an item already attached elsewhere", () => {
    const oldParent = new ItemNode();
    const newParent = new ItemNode();
    const child = new ItemNode();
    oldParent.insertChild(child);
    expect(oldParent.children).toContain(child);

    newParent.insertChild(child);
    expect(oldParent.children).not.toContain(child);
    expect(newParent.children).toContain(child);
    expect(child.parent).toBe(newParent);
  });

  it("removeChild detaches the item, leaving it parentless (a root)", () => {
    const parent = new ItemNode();
    const child = new ItemNode();
    parent.insertChild(child);
    parent.removeChild(child);
    expect(parent.children).not.toContain(child);
    expect(child.parent).toBe(null);
    expect(child.isRoot).toBe(true);
  });
});

describe("ItemNode JSON round-trip", () => {
  it("toJSON()/fromJSON() preserve every explicit field", () => {
    const root = new ItemNode();
    root.text = "Root";
    root.layout = layoutRepo.get("map");
    root.color = "#d33";
    root.status = true;

    const child = new ItemNode();
    child.text = "Child";
    child.value = 5;
    child.shape = shapeRepo.get("box");
    root.insertChild(child);

    const json = root.toJSON();
    const restored = ItemNode.fromJSON(json);

    expect(restored.text).toBe("Root");
    expect(restored.color).toBe("#d33");
    expect(restored.status).toBe(true);
    expect(restored.layout.id).toBe("map");
    expect(restored.children).toHaveLength(1);
    expect(restored.children[0].text).toBe("Child");
    expect(restored.children[0].value).toBe(5);
    expect(restored.children[0].shape.id).toBe("box");
  });

  it("clone() produces an independent copy with a fresh id", () => {
    const root = new ItemNode();
    root.text = "Original";
    const clone = root.clone();

    expect(clone.text).toBe("Original");
    expect(clone.id).not.toBe(root.id);

    clone.text = "Changed";
    expect(root.text).toBe("Original");
  });
});

describe("ItemNode.side", () => {
  it("is a real signal: get/set round-trips like other item-store properties", () => {
    const item = new ItemNode();
    expect(item.side).toBe(null);
    item.side = "left";
    expect(item.side).toBe("left");
  });

  it("invalidates the parent's layoutResult when it changes, with no dedicated version counter needed", () => {
    const root = new ItemNode();
    root.layout = layoutRepo.get("map");
    const child = new ItemNode();
    child.side = "right";
    root.insertChild(child);
    root.layoutResult(); // warm up

    const original = root._computeLayout.bind(root);
    let calls = 0;
    root._computeLayout = () => {
      calls++;
      return original();
    };

    child.side = "left";
    root.layoutResult();

    expect(calls).toBe(1);
  });
});

// Regression test: before the fix, _computeLayout() always called
// computeMapLayout()'s non-root branch regardless of the item's actual
// explicit layout, so an item set to a Tree layout silently rendered
// with Graph's algorithm instead. TreeLayout's connector uses a
// quarter-circle arc ("A R R ..."); GraphLayout's single-child
// connector uses a cubic Bezier ("C ..."), giving a simple, checkable
// distinguishing signal (same pattern as layout/pure-layout.test.js).
describe("ItemNode.layoutResult layout-kind dispatch (regression)", () => {
  it("uses the tree algorithm, not graph's, when the item's own layout is explicitly a tree layout", () => {
    const root = new ItemNode();
    root.layout = layoutRepo.get("map");
    const branch = new ItemNode();
    branch.side = "right";
    root.insertChild(branch);
    branch.layout = layoutRepo.get("tree-right");
    const child = new ItemNode();
    branch.insertChild(child);

    const result = branch.layoutResult();

    expect(result.connectorPaths[0].d).toContain("A 8 8");
    expect(result.connectorPaths[0].d).not.toContain("C ");
  });
});
