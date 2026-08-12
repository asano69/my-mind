import { describe, expect, it } from "vitest";
import { computeGraphLayout } from "./graph.js";
import { computeTreeLayout } from "./tree.js";
import { computeMapLayout } from "./map.js";
import { repo } from "./layout.js";

const shape = {
  getHorizontalAnchor(item) {
    return item.contentPosition[0] + item.contentSize[0] / 2;
  },
  getVerticalAnchor(item) {
    return item.contentPosition[1] + item.contentSize[1] / 2;
  },
};

function item({
  children = [],
  collapsed = false,
  color = "#abc",
  contentSize = [40, 20],
  isRoot = false,
  side = "right",
} = {}) {
  const node = {
    children,
    collapsed,
    contentPosition: [0, 0],
    contentSize,
    isRoot,
    parent: null,
    position: [0, 0],
    resolvedColor: color,
    resolvedShape: shape,
    side,
    size: contentSize,
  };
  children.forEach((child) => {
    child.parent = node;
  });
  return node;
}

describe("pure layout computations", () => {
  it("computes graph positions and connector descriptors without DOM refs", () => {
    const child = item({ contentSize: [30, 10], color: "#0f0" });
    const root = item({ children: [child], contentSize: [50, 20] });
    child.size = [30, 10];

    const { connectorPaths: connectors, totalHeight: layoutResult } =
      computeGraphLayout(repo.get("graph-right"), root, "right");

    expect(layoutResult).toBe(20);
    expect(root.contentPosition).toEqual([0, 0]);
    expect(child.position).toEqual([66, 19]);
    expect(connectors).toHaveLength(1);
    expect(connectors[0]).toMatchObject({ stroke: "#abc" });
    expect(connectors[0].togglePosition).toEqual([58.5, 10]);
    expect(connectors[0].d).toContain("C");
  });

  it("computes tree connector descriptors separately from SVG writes", () => {
    const a = item({ contentSize: [30, 10] });
    const b = item({ contentSize: [20, 10] });
    a.size = [30, 10];
    b.size = [20, 10];
    const root = item({ children: [a, b], contentSize: [50, 20] });

    const { connectorPaths, totalWidth } = computeTreeLayout(
      repo.get("tree-right"),
      root,
      "right",
    );

    expect(totalWidth).toBe(62);
    expect(a.position).toEqual([32, 24]);
    expect(b.position).toEqual([32, 38]);
    expect(connectorPaths).toHaveLength(1);
    expect(connectorPaths[0].togglePosition).toEqual([16.5, 19]);
    expect(connectorPaths[0].d).toContain("A 8 8");
  });

  it("returns map root paths grouped by each child color", () => {
    const left = item({ color: "#f00", side: "left" });
    const right = item({ color: "#00f", side: "right" });
    left.size = [40, 20];
    right.size = [40, 20];
    const root = item({
      children: [left, right],
      contentSize: [60, 30],
      isRoot: true,
    });

    const result = computeMapLayout(repo.get("map"), root);

    expect(root.contentPosition).toEqual([56, 0]);
    expect(left.position).toEqual([0, 29]);
    expect(right.position).toEqual([132, 29]);
    expect(result.width).toBe(172);
    expect(result.connectorPaths.map((path) => path.fill)).toEqual([
      "#f00",
      "#00f",
    ]);
    expect(result.connectorPaths.every((path) => path.d.endsWith(" Z"))).toBe(
      true,
    );
  });
});
