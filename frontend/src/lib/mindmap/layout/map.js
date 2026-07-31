// src/layout/map.ts
import GraphLayout, { SPACING_RANK } from "./graph.js";
import { repo } from "./layout.js";
import * as svg from "../svg.js";
export default class MapLayout extends GraphLayout {
  constructor() {
    super(...arguments);
    this.LINE_THICKNESS = 8;
  }
  update(item) {
    if (item.isRoot) {
      this.layoutRoot(item);
    } else {
      var side = this.getChildDirection(item);
      repo.get(`graph-${side}`).update(item);
    }
  }
  getChildDirection(child) {
    while (child.parent && !child.parent.isRoot) {
      child = child.parent;
    }
    /*
     * child is now the sub-root node. During tree construction/moves, Solid
     * can synchronously ask for layout while a child has been inserted into a
     * children array but its parent signal has not been connected yet. Avoid
     * crashing on that transient disconnected state; the next invalidation
     * after parent assignment will resolve the final side.
     */
    if (!child.parent) {
      return child.side || "right";
    }
    let side = child.side;
    if (side) {
      return side;
    }
    let counts = { left: 0, right: 0 };
    child.parent.children.forEach((sibling) => {
      let side = sibling.side;
      if (!side) {
        side = counts.right > counts.left ? "left" : "right";
        sibling._setSide(side, { bump: false });
      }
      counts[side]++;
    });
    return child.side; // we have a guaranteed side now
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
    this.drawRootConnectors(item, "left", childrenLeft);
    this.drawRootConnectors(item, "right", childrenRight);
  }
  drawRootConnectors(item, direction, children) {
    if (children.length == 0 || item.collapsed) {
      return;
    }
    const { contentSize, contentPosition, resolvedShape, dom } = item;
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
      let attrs = {
        d: d.join(" "),
        fill: resolvedColor,
        stroke: resolvedColor,
        "stroke-width": "2",
      };
      return svg.node("path", attrs);
    });
    dom.connectors.append(...paths);
  }
}
new MapLayout("map", "Map");
