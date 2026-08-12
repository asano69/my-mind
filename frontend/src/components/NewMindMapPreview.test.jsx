import { describe, expect, it } from "vitest";
import ItemNode from "../lib/mindmap/itemStore.js";
import { repo as layoutRepo } from "../lib/mindmap/layout/layout.js";
import { repo as shapeRepo } from "../lib/mindmap/shape/shape.js";
import "../lib/mindmap/layout/map.js";
import "../lib/mindmap/shape/box.js";
import "../lib/mindmap/shape/ellipse.js";
import "../lib/mindmap/shape/underline.js";
import {
  computePreviewTreeLayout,
  measureContentSize,
  rootFromMapData,
  togglePositionFor,
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

describe("computePreviewTreeLayout", () => {
  it("computes descendants before root and exposes connector descriptors", () => {
    const { root, left, right, grandchild } = previewTree();

    const result = computePreviewTreeLayout(root);

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

    computePreviewTreeLayout(root);

    expect(first.position).not.toBe(second.position);
    expect(first.position[1]).toBe(0);
    expect(second.position[1]).toBe(first.size[1] + 4);
  });

  it("omits descendant layout snapshots when a node is collapsed", () => {
    const { root, right, grandchild } = previewTree();
    right.collapsed = true;

    const result = computePreviewTreeLayout(root);
    const rightLayout = result.childLayouts.find(
      (layout) => layout.item === right,
    );

    expect(rightLayout.childLayouts).toEqual([]);
    expect(rightLayout.connectorPaths.some((path) => path.d)).toBe(false);
    expect(grandchild.size).toBeUndefined();
  });

  it("uses measured content sizes when they are available", () => {
    const { root, right, grandchild } = previewTree();
    const measuredSizes = new Map([
      [root.id, [260, 90]],
      [right.id, [180, 60]],
      [grandchild.id, [110, 30]],
    ]);

    const result = computePreviewTreeLayout(root, measuredSizes);

    expect(root.contentSize).toEqual([260, 90]);
    expect(right.contentSize).toEqual([180, 60]);
    expect(grandchild.contentSize).toEqual([110, 30]);
    expect(result.size[0]).toBeGreaterThan(260);
  });
});

describe("toggle descriptor and collapsed signal boundary", () => {
  it("returns null for the root's own connectors (root's toggle is never rendered, see map.css)", () => {
    const { root } = previewTree();

    const layout = computePreviewTreeLayout(root);

    expect(togglePositionFor(layout.connectorPaths)).toBeNull();
  });

  it("keeps a togglePosition for a node with children, expanded or collapsed", () => {
    const { root, right } = previewTree();

    const expanded = computePreviewTreeLayout(root);
    const rightExpanded = expanded.childLayouts.find(
      (layout) => layout.item === right,
    );
    expect(togglePositionFor(rightExpanded.connectorPaths)).not.toBeNull();

    right.collapsed = true;
    const collapsed = computePreviewTreeLayout(root);
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
