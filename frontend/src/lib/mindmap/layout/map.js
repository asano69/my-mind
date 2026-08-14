// src/layout/map.ts
import GraphLayout, { computeGraphLayout, SPACING_RANK } from "./graph.js";
import { repo } from "./layout.js";
export function computeMapLayout(layout, item) {
  if (item.isRoot) {
    return layout.layoutRoot(item);
  }
  const side = layout.getChildDirection(item);
  const graphLayout = repo.get(`graph-${side}`);
  return computeGraphLayout(graphLayout, item, side);
}

export default class MapLayout extends GraphLayout {
  constructor() {
    super(...arguments);
    this.LINE_THICKNESS = 8;
  }
  getChildDirection(child) {
    while (child.parent && !child.parent.isRoot) {
      child = child.parent;
    }
    // child is now the sub-root node (a direct child of the map's root).
    // Side is decided explicitly, not inferred: either the item's own
    // `side` field (set by the SetSide command, JSON restore, or a
    // drag-and-drop into the "root:left"/"root:right" dnd-kit group, see
    // dnd/sortableTree.js's Phase 5), or "right" as the default for a
    // freshly created item that hasn't been assigned a side yet. This
    // replaces the old sibling-counting auto-balance -- dnd-kit's own
    // drop groups are now the single source of truth for root-level
    // left/right placement (see docs/07-dnd-kit-solid-refactor.md,
    // Phase 5). This also stays safe if child.parent is transiently null
    // (mid tree-construction/move), since the loop above simply exits and
    // we fall back to child.side || "right" without dereferencing it.
    return child.side || "right";
  }
  pickSibling(item, dir) {
    if (item.isRoot) {
      return item;
    }
    const parent = item.parent;
    var children = parent.children;
    if (parent.isRoot) {
      var side = this.getChildDirection(item);
      children = children.filter(
        (child) => this.getChildDirection(child) == side,
      );
    }
    var index = children.indexOf(item);
    index += dir;
    index = (index + children.length) % children.length;
    return children[index];
  }
  layoutRoot(item) {
    const { children, contentSize } = item;
    let childrenLeft = [];
    let childrenRight = [];
    let contentPosition = [0, 0];
    children.forEach((child) => {
      var side = this.getChildDirection(child);
      if (side == "left") {
        childrenLeft.push(child);
      } else {
        childrenRight.push(child);
      }
    });
    let bboxLeft = this.computeChildrenBBox(childrenLeft, 1);
    let bboxRight = this.computeChildrenBBox(childrenRight, 1);
    let height = Math.max(bboxLeft[1], bboxRight[1], contentSize[1]);
    let left = 0;
    this.layoutChildren(
      childrenLeft,
      "left",
      [left, Math.round((height - bboxLeft[1]) / 2)],
      bboxLeft,
    );
    left += bboxLeft[0];
    if (childrenLeft.length) {
      left += SPACING_RANK;
    }
    contentPosition[0] = left;
    left += contentSize[0];
    if (childrenRight.length) {
      left += SPACING_RANK;
    }
    this.layoutChildren(
      childrenRight,
      "right",
      [left, Math.round((height - bboxRight[1]) / 2)],
      bboxRight,
    );
    left += bboxRight[0];
    contentPosition[1] = Math.round((height - contentSize[1]) / 2);
    item.contentPosition = contentPosition;
    return {
      connectorPaths: [
        ...this.computeRootConnectors(item, "left", childrenLeft),
        ...this.computeRootConnectors(item, "right", childrenRight),
      ],
      height,
      width: left,
    };
  }
  computeRootConnectors(item, direction, children) {
    if (children.length == 0 || item.collapsed) {
      return [];
    }
    const { contentSize, contentPosition, resolvedShape } = item;
    let x1 = contentPosition[0] + contentSize[0] / 2;
    let y1 = resolvedShape.getVerticalAnchor(item);
    const half = this.LINE_THICKNESS / 2;
    let paths = children.map((child) => {
      const { resolvedColor, resolvedShape, position } = child;
      let x2 = this.getChildAnchor(child, direction);
      let y2 = resolvedShape.getVerticalAnchor(child) + position[1];
      let angle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
      let dx = Math.cos(angle) * half;
      let dy = Math.sin(angle) * half;
      let d = [
        `M ${x1 - dx} ${y1 - dy}`,
        `Q ${(x2 + x1) / 2} ${y2} ${x2} ${y2}`,
        `Q ${(x2 + x1) / 2} ${y2} ${x1 + dx} ${y1 + dy}`,
        `Z`,
      ];
      return {
        d: d.join(" "),
        fill: resolvedColor,
        stroke: resolvedColor,
      };
    });
    return paths;
  }
}
new MapLayout("map", "Map");
