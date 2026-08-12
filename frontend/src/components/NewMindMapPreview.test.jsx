import { describe, expect, it } from "vitest";
import ItemNode from "../lib/mindmap/itemStore.js";
import { repo as layoutRepo } from "../lib/mindmap/layout/layout.js";
import { repo as shapeRepo } from "../lib/mindmap/shape/shape.js";
import "../lib/mindmap/layout/map.js";
import "../lib/mindmap/shape/box.js";
import "../lib/mindmap/shape/ellipse.js";
import "../lib/mindmap/shape/underline.js";
import { computePreviewTreeLayout } from "./NewMindMapPreview.jsx";

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
    expect(result.connectorPaths).toHaveLength(2);
    expect(result.connectorPaths.every((path) => path.d)).toBe(true);
    expect(left.size).toEqual([150, 44]);
    expect(grandchild.size).toEqual([150, 44]);
    expect(right.size[0]).toBeGreaterThan(150);
    expect(root.size[0]).toBeGreaterThan(right.size[0]);
    expect(root.contentPosition[0]).toBeGreaterThan(left.position[0]);
    expect(right.position[0]).toBeGreaterThan(root.contentPosition[0]);
  });
});
