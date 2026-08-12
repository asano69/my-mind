// src/layout/tree.ts
import Layout from "./layout.js";
import { TOGGLE_SIZE } from "../item.js";
import * as svg from "../svg.js";
const SPACING_RANK = 32;
const R = SPACING_RANK / 4;
const LINE_OFFSET = SPACING_RANK / 2;
export function computeTreeLayout(
  layout,
  item,
  rankDirection = layout.childDirection,
) {
  const totalWidth = layout.layoutItem(item, rankDirection);
  const connectorPaths = layout.computeLines(item, rankDirection, totalWidth);
  return { connectorPaths, totalWidth };
}

export default class TreeLayout extends Layout {
  update(item) {
    const { connectorPaths } = computeTreeLayout(
      this,
      item,
      this.childDirection,
    );
    this.writeConnectorPaths(item, connectorPaths);
  }
  layoutItem(item, rankDirection) {
    const { contentSize, children } = item;
    let rankSize = contentSize[0];
    if (!item.collapsed && children.length > 0) {
      // children size
      let bbox = this.computeChildrenBBox(children, 1);
      // node size
      rankSize = Math.max(rankSize, bbox[0] + SPACING_RANK);
      let offset = [SPACING_RANK, contentSize[1] + this.SPACING_CHILD];
      if (rankDirection == "left") {
        offset[0] = rankSize - bbox[0] - SPACING_RANK;
      }
      this.layoutChildren(children, rankDirection, offset, bbox);
    }
    // label position
    let labelPos = 0;
    if (rankDirection == "left") {
      labelPos = rankSize - contentSize[0];
    }
    item.contentPosition = [labelPos, 0];
    return rankSize;
  }
  layoutChildren(children, rankDirection, offset, bbox) {
    children.forEach((child) => {
      const { size } = child;
      let left = offset[0];
      if (rankDirection == "left") {
        left += bbox[0] - size[0];
      }
      child.position = [left, offset[1]];
      offset[1] += size[1] + this.SPACING_CHILD; /* offset for next child */
    });
  }
  computeLines(item, direction, totalWidth) {
    const { resolvedShape, resolvedColor, children } = item;
    const dirModifier = direction == "right" ? 1 : -1;
    const lineX =
      (direction == "left" ? totalWidth - LINE_OFFSET : LINE_OFFSET) + 0.5;
    const toggleDistance = TOGGLE_SIZE + 2;
    let pointAnchor = [lineX, resolvedShape.getVerticalAnchor(item)];
    const togglePosition = [pointAnchor[0], pointAnchor[1] + toggleDistance];
    if (children.length == 0 || item.collapsed) {
      return [{ togglePosition }];
    }
    let lastChild = children[children.length - 1];
    let lineEnd = [
      lineX,
      lastChild.resolvedShape.getVerticalAnchor(lastChild) +
        lastChild.position[1] -
        R,
    ];
    let d = [`M ${pointAnchor}`, `L ${lineEnd}`];
    let sweep = dirModifier > 0 ? 0 : 1;
    children.forEach((child) => {
      const { resolvedShape, position } = child;
      const y = resolvedShape.getVerticalAnchor(child) + position[1];
      d.push(
        `M ${lineX} ${y - R}`,
        `A ${R} ${R} 0 0 ${sweep} ${lineX + dirModifier * R} ${y}`,
        `L ${this.getChildAnchor(child, direction)} ${y}`,
      );
    });
    return [{ d: d.join(" "), stroke: resolvedColor, togglePosition }];
  }
  writeConnectorPaths(item, connectorPaths) {
    for (const pathInfo of connectorPaths) {
      if (pathInfo.togglePosition) {
        this.positionToggle(item, pathInfo.togglePosition);
      }
      if (!pathInfo.d) {
        continue;
      }
      const path = svg.node("path", {
        d: pathInfo.d,
        stroke: pathInfo.stroke,
        fill: "none",
        "stroke-width": "2",
      });
      item.dom.connectors.append(path);
    }
  }
}
new TreeLayout("tree-left", "Left", "left");
new TreeLayout("tree-right", "Right", "right");
