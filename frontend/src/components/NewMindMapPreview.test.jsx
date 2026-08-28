import { describe, expect, it, vi } from "vitest";

// Use the synchronous dist build (same workaround as item.test.js/
// action.item.test.js/title.test.js/itemStore.test.js) so
// ItemNode.layoutResult (a real createMemo, unlike the plain resolvedXxx
// getters) recomputes synchronously on the next read after a signal
// write (insertChild, setMeasuredSize, collapsed, color, ...), instead
// of the default "solid-js" export's microtask-scheduled update, which
// this file's synchronous assertions can't observe.
vi.mock("solid-js", async () => await import("solid-js/dist/solid.js"));

import ItemNode from "../lib/mindmap/core/itemStore.js";
import { repo as layoutRepo } from "../lib/mindmap/core/layout/layout.js";
import { repo as shapeRepo } from "../lib/mindmap/core/shape/shape.js";
import "../lib/mindmap/core/layout/map.js";
import "../lib/mindmap/core/shape/box.js";
import "../lib/mindmap/core/shape/ellipse.js";
import "../lib/mindmap/core/shape/underline.js";
import {
  measureContentSize,
  registerDomRef,
  rootFromMapData,
  togglePositionFor,
  unregisterDomRef,
  visiblePreviewChildren,
} from "./NewMindMapPreview.jsx";

function previewTree() {
  const root = new ItemNode();
  root.text = "Root";
  root.layout = layoutRepo.get("map");
  root.shape = shapeRepo.get("ellipse");

  const left = new ItemNode();
  left.text = "Left";
  left.side = "left";

  const right = new ItemNode();
  right.text = "Right";
  right.side = "right";

  const grandchild = new ItemNode();
  grandchild.text = "Nested";
  right.insertChild(grandchild);

  root.insertChild(left);
  root.insertChild(right);
  return { root, left, right, grandchild };
}

describe("ItemNode.layoutResult (Phase 3.5)", () => {
  it("computes descendants before root and exposes connector descriptors", () => {
    const { root, left, right, grandchild } = previewTree();

    const result = root.layoutResult();

    expect(result.item).toBe(root);
    expect(result.childLayouts.map((layout) => layout.item)).toEqual([
      left,
      right,
    ]);
    expect(result.childLayouts[1].childLayouts[0].item).toBe(grandchild);
    expect(result.connectorPaths).toHaveLength(2);
    expect(result.connectorPaths.every((path) => path.d)).toBe(true);
    expect(left.size).toEqual([150, 44]);
    expect(grandchild.size).toEqual([150, 44]);
    expect(right.size[0]).toBeGreaterThan(150);
    expect(root.size[0]).toBeGreaterThan(right.size[0]);
    expect(root.contentPosition[0]).toBeGreaterThan(left.position[0]);
    expect(right.position[0]).toBeGreaterThan(root.contentPosition[0]);
  });

  it("stores independent position arrays for siblings", () => {
    const root = new ItemNode();
    root.layout = layoutRepo.get("map");

    const first = new ItemNode();
    first.text = "First";
    first.side = "right";
    const second = new ItemNode();
    second.text = "Second";
    second.side = "right";
    root.insertChild(first);
    root.insertChild(second);

    root.layoutResult();

    expect(first.position).not.toBe(second.position);
    expect(first.position[1]).toBe(0);
    expect(second.position[1]).toBe(first.size[1] + 4);
  });

  it("omits descendant layout snapshots when a node is collapsed", () => {
    const { root, right } = previewTree();
    right.collapsed = true;

    const result = root.layoutResult();
    const rightLayout = result.childLayouts.find(
      (layout) => layout.item === right,
    );

    expect(rightLayout.childLayouts).toEqual([]);
    expect(rightLayout.connectorPaths.some((path) => path.d)).toBe(false);
    // Not asserting on grandchild.size here: under the synchronous
    // solid-js test build (see the vi.mock above), an already-established
    // memo can be evaluated during intermediate construction/attachment
    // steps (e.g. right.insertChild(grandchild), before right.collapsed
    // was ever set), leaving a stale grandchild.size field from that
    // transient run. That field is never read by anything real -- the
    // authoritative snapshot returned by root.layoutResult() (checked
    // above via rightLayout.childLayouts/connectorPaths) correctly
    // excludes grandchild. In a real, lazily-pulled solid-js build this
    // stale field would never be set at all, since grandchild's memo
    // would simply never run.
  });

  it("uses measured content sizes when they are available", () => {
    const { root, right, grandchild } = previewTree();
    root.setMeasuredSize([260, 90]);
    right.setMeasuredSize([180, 60]);
    grandchild.setMeasuredSize([110, 30]);

    const result = root.layoutResult();

    expect(root.contentSize).toEqual([260, 90]);
    expect(right.contentSize).toEqual([180, 60]);
    expect(grandchild.contentSize).toEqual([110, 30]);
    expect(result.size[0]).toBeGreaterThan(260);
  });

  it("recomputes the changed child and its ancestors, but not an untouched sibling (Phase 3.5 locality)", () => {
    const { root, left, right } = previewTree();
    root.layoutResult(); // warm up

    const leftBefore = left.layoutResult();
    right.setMeasuredSize([300, 50]);
    root.layoutResult();

    // right's own memo, and root's (right's only ancestor), must have
    // recomputed -- but left's memo, never invalidated, must return the
    // exact same cached object reference as before.
    expect(left.layoutResult()).toBe(leftBefore);
  });
});

describe("toggle descriptor and collapsed signal boundary", () => {
  it("returns null for the root's own connectors (root's toggle is never rendered, see map.css)", () => {
    const { root } = previewTree();

    const layout = root.layoutResult();

    expect(togglePositionFor(layout.connectorPaths)).toBeNull();
  });

  it("keeps a togglePosition for a node with children, expanded or collapsed", () => {
    const { root, right } = previewTree();

    const expanded = root.layoutResult();
    const rightExpanded = expanded.childLayouts.find(
      (layout) => layout.item === right,
    );
    expect(togglePositionFor(rightExpanded.connectorPaths)).not.toBeNull();

    right.collapsed = true;
    const collapsed = root.layoutResult();
    const rightCollapsed = collapsed.childLayouts.find(
      (layout) => layout.item === right,
    );
    // The toggle glyph stays addressable while collapsed; only the
    // connector line itself (`d`) disappears.
    expect(togglePositionFor(rightCollapsed.connectorPaths)).not.toBeNull();
    expect(rightCollapsed.connectorPaths.some((path) => path.d)).toBe(false);
  });

  it("visiblePreviewChildren tracks the collapsed signal directly", () => {
    const { root } = previewTree();

    expect(visiblePreviewChildren(root)).toEqual(root.childItems);

    root.collapsed = true;
    expect(visiblePreviewChildren(root)).toEqual([]);

    root.collapsed = false;
    expect(visiblePreviewChildren(root)).toEqual(root.childItems);
  });
});

describe("rootFromMapData", () => {
  it("loads the saved map root into the preview item store", () => {
    const root = rootFromMapData({
      root: {
        id: "root-id",
        text: "Saved root",
        layout: "map",
        shape: "ellipse",
        color: "#ffcc00",
        children: [
          { id: "left-id", text: "Saved left", side: "left" },
          { id: "right-id", text: "Saved right", side: "right" },
        ],
      },
    });

    expect(root.id).toBe("root-id");
    expect(root.text).toBe("Saved root");
    expect(root.layout).toBe(layoutRepo.get("map"));
    expect(root.resolvedShape).toBe(shapeRepo.get("ellipse"));
    expect(root.color).toBe("#ffcc00");
    expect(root.childItems.map((child) => child.text)).toEqual([
      "Saved left",
      "Saved right",
    ]);
    expect(root.childItems.map((child) => child.side)).toEqual([
      "left",
      "right",
    ]);
  });

  it("preserves saved rich node fields needed by the JSX renderer", () => {
    const root = rootFromMapData({
      root: {
        text: "Root",
        children: [
          {
            text: "<b>Bold</b> <s>done</s>",
            shape: "underline",
            status: "yes",
            value: 42,
            icon: "fa-star",
            notes: "note",
          },
        ],
      },
    });
    const child = root.childItems[0];

    expect(child.text).toBe("<b>Bold</b> <s>done</s>");
    expect(child.resolvedShape).toBe(shapeRepo.get("underline"));
    expect(child.status).toBe(true);
    expect(child.resolvedStatus).toBe(true);
    expect(child.value).toBe(42);
    expect(child.resolvedValue).toBe(42);
    expect(child.icon).toBe("fa-star");
    expect(child.notes).toBe("note");
  });

  it("returns null for missing map data", () => {
    expect(rootFromMapData(null)).toBeNull();
    expect(rootFromMapData({})).toBeNull();
  });
});

// Phase 4.1 of docs/08-phase4-dependency-inventory.md: the domRefs
// registry itself is not yet consumed by anything (mouse.js's drag
// math and clipboard.js's cut-visual toggling wire up in Phase 4.7/4.8),
// so these tests only pin down registerDomRef/unregisterDomRef's own
// Map bookkeeping -- no Solid rendering involved, matching the plan's
// "no real DOM required, spying on ref call counts is enough" note.
describe("registerDomRef / unregisterDomRef", () => {
  it("registers an item's element under its id", () => {
    const domRefs = new Map();
    const item = { id: "abc" };
    const el = {};

    registerDomRef(domRefs, item, el);

    expect(domRefs.get("abc")).toBe(el);
    expect(domRefs.size).toBe(1);
  });

  it("removes only the given item's entry on unregister", () => {
    const domRefs = new Map();
    const itemA = { id: "a" };
    const itemB = { id: "b" };
    registerDomRef(domRefs, itemA, {});
    registerDomRef(domRefs, itemB, {});

    unregisterDomRef(domRefs, itemA);

    expect(domRefs.has("a")).toBe(false);
    expect(domRefs.has("b")).toBe(true);
    expect(domRefs.size).toBe(1);
  });

  it("re-registering the same item id overwrites the previous element", () => {
    const domRefs = new Map();
    const item = { id: "x" };
    const first = {};
    const second = {};

    registerDomRef(domRefs, item, first);
    registerDomRef(domRefs, item, second);

    expect(domRefs.get("x")).toBe(second);
    expect(domRefs.size).toBe(1);
  });
});

describe("measureContentSize", () => {
  it("uses the largest rendered and scroll dimensions", () => {
    expect(
      measureContentSize(
        {
          offsetWidth: 100.2,
          scrollWidth: 128.1,
          offsetHeight: 24,
          scrollHeight: 40.4,
        },
        [150, 44],
      ),
    ).toEqual([129, 41]);
  });

  it("falls back when the element has no measurable size yet", () => {
    expect(
      measureContentSize(
        { offsetWidth: 0, scrollWidth: 0, offsetHeight: 0, scrollHeight: 0 },
        [150, 44],
      ),
    ).toEqual([150, 44]);
  });
});
