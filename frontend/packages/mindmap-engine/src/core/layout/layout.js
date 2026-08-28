const OPPOSITE = {
  left: "right",
  right: "left",
  top: "bottom",
  bottom: "top",
};
export default class Layout {
  constructor(id, label, childDirection = "right") {
    this.id = id;
    this.label = label;
    this.childDirection = childDirection;
    this.SPACING_CHILD = 4;
    repo.set(this.id, this);
  }
  get option() {
    return new Option(this.label, this.id);
  }
  /**
   * @param child Child node (its parent uses this layout)
   */
  getChildDirection(_child) {
    return this.childDirection;
  }
  computeAlignment(item) {
    let direction = item.isRoot
      ? this.childDirection
      : item.parent.resolvedLayout.getChildDirection(item);
    if (direction == "left") {
      return "right";
    }
    return "left";
  }
  pick(item, dir) {
    /* direction for a child */
    if (!item.collapsed) {
      var children = item.children;
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (this.getChildDirection(child) == dir) {
          return child;
        }
      }
    }
    if (item.isRoot) {
      return item;
    }
    let childItem = item;
    var parentLayout = childItem.parent.resolvedLayout;
    var thisChildDirection = parentLayout.getChildDirection(item);
    if (thisChildDirection == dir) {
      return childItem;
    } else if (thisChildDirection == OPPOSITE[dir]) {
      return childItem.parent;
    } else {
      return parentLayout.pickSibling(
        childItem,
        dir == "left" || dir == "top" ? -1 : +1,
      );
    }
  }
  pickSibling(item, dir) {
    if (item.isRoot) {
      return item;
    }
    var children = item.parent.children;
    var index = children.indexOf(item);
    index += dir;
    index = (index + children.length) % children.length;
    return children[index];
  }
  getChildAnchor(item, side) {
    let { position, contentPosition, contentSize } = item;
    let pos;
    if (side == "left" || side == "right") {
      pos = position[0] + contentPosition[0];
      if (side == "left") {
        pos += contentSize[0];
      }
    } else {
      pos = position[1] + contentPosition[1];
      if (side == "top") {
        pos += contentSize[1];
      }
    }
    return pos;
  }
  computeChildrenBBox(children, childIndex) {
    // makes sense only when not collapsed
    let bbox = [0, 0];
    var rankIndex = (childIndex + 1) % 2;
    children.forEach((child) => {
      const { size } = child;
      bbox[rankIndex] = Math.max(
        bbox[rankIndex],
        size[rankIndex],
      ); /* adjust cardinal size */
      bbox[childIndex] += size[childIndex]; /* adjust orthogonal size */
    });
    if (children.length > 1) {
      bbox[childIndex] += this.SPACING_CHILD * (children.length - 1);
    } /* child separation */
    return bbox;
  }
}
export const repo = new Map();
