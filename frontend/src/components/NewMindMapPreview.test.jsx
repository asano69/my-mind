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
