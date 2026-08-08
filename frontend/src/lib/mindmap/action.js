// src/action.ts
import Item from "./item.js";
import * as app from "./my-mind.js";
export default class Action {
  do() {}
  undo() {}
}
export class Multi extends Action {
  constructor(actions) {
    super();
    this.actions = actions;
  }
  do() {
    this.actions.forEach((action) => action.do());
  }
  undo() {
    this.actions
      .slice()
      .reverse()
      .forEach((action) => action.undo());
  }
}
export class InsertNewItem extends Action {
  // `item` lets a caller reuse an already-constructed (and already
  // inserted) Item instead of creating a brand-new one -- see
  // command/edit.js's Finish command, which creates a draft item
  // directly (bypassing history) so the user can type into it, then
  // constructs this action only once real content exists, reusing that
  // same item so the whole creation becomes a single undo step instead
  // of "insert empty node" + "set text" as two separate history entries.
  constructor(parent, index, item = null) {
    super();
    this.parent = parent;
    this.index = index;
    if (item) {
      this.item = item;
    } else {
      this.item = new Item();
      // Marks this item as freshly inserted so Finish (see
      // command/edit.js) can discard it instead of committing empty text,
      // without affecting existing items that already had empty text.
      this.item.isNew = true;
      // Auto-balance left/right placement for new root-level children:
      // assign whichever side currently has fewer children, so the map
      // doesn't grow lopsided when nodes are added without an explicit
      // side. Only meaningful for root's direct children -- side has no
      // effect anywhere else in the tree (see command/command.js's SetSide).
      if (parent.isRoot) {
        this.item.side = pickBalancedSide(parent);
      }
    }
  }
  do() {
    this.parent.collapsed = false; // FIXME remember?
      if (parent.isRoot) {
        this.item.side = pickBalancedSide(parent);
      }
      // Inherit the siblings' shape when they all agree: if every
      // existing child of `parent` already shares the same explicit
      // shape, treat that as a deliberate style choice for this branch
      // and default the new sibling to it too, instead of falling back
      // to the plain depth-based default shape (see item.js's
      // resolvedShape).
      const inheritedShape = pickInheritedShape(parent);
      if (inheritedShape) {
        this.item.shape = inheritedShape;
      }
    }
  }
  undo() {
    this.parent.removeChild(this.item);
    app.selectItem(this.parent);
  }
}
// Returns the shape shared by every one of parent's existing children,
// or null if there are fewer than two children, or if any child has no
// explicit shape (unset) or they disagree.
function pickInheritedShape(parent) {
  const { children } = parent;
  if (children.length < 2) {
    return null;
  }
  const first = children[0].shape;
  if (!first) {
    return null;
  }
  return children.every((child) => child.shape === first) ? first : null;
}
// Counts root's existing direct children by side (falling back to
// "right", the same default MapLayout.getChildDirection uses for a
// child with no side set) and returns whichever side currently has
// fewer children.
function pickBalancedSide(root) {
  let left = 0;
  let right = 0;
  root.children.forEach((child) => {
    if (child.side === "left") {
      left++;
    } else {
      right++;
    }
  });
  return right > left ? "left" : "right";
}

export class AppendItem extends Action {
  constructor(parent, item) {
    super();
    this.parent = parent;
    this.item = item;
  }
  do() {
    // Auto-balance left/right placement for appended/pasted items that
    // don't already carry an explicit side (plain-text paste, or a copy
    // of a node that was never a direct root child) -- mirrors
    // InsertNewItem's behavior so pasting under root doesn't always
    // pile up on the same side.
    if (this.parent.isRoot && !this.item.side) {
      this.item.side = pickBalancedSide(this.parent);
    }
    this.parent.insertChild(this.item);
    app.selectItem(this.item);
  }
  undo() {
    this.parent.removeChild(this.item);
    app.selectItem(this.parent);
  }
}
export class RemoveItem extends Action {
  constructor(item) {
    super();
    this.item = item;
    this.parent = item.parent;
    this.index = this.parent.children.indexOf(this.item);
  }
  do() {
    this.parent.removeChild(this.item);
    app.selectItem(this.parent);
  }
  undo() {
    this.parent.insertChild(this.item, this.index);
    app.selectItem(this.item);
  }
}
export class MoveItem extends Action {
  constructor(item, newParent, newIndex, newSide = null) {
    super();
    this.item = item;
    this.newParent = newParent;
    this.newIndex = newIndex;
    this.newSide = newSide;
    this.oldParent = item.parent;
    this.oldIndex = this.oldParent.children.indexOf(item);
    this.oldSide = item.side;
  }
  do() {
    const { item, newParent, newIndex, newSide } = this;
    // Same auto-balance as AppendItem above: a move with no explicit side
    // (e.g. cut-then-paste via clipboard.js) shouldn't silently reset the
    // item to the "right" default when it lands directly under root --
    // pick whichever side is currently lighter instead.
    item.side =
      newSide ?? (newParent.isRoot ? pickBalancedSide(newParent) : null);
    if (newIndex === undefined) {
      newParent.insertChild(item);
    } else {
      newParent.insertChild(item, newIndex);
    }
    app.selectItem(item);
  }
  undo() {
    const { item, oldSide, oldIndex, oldParent, newParent } = this;
    item.side = oldSide;
    oldParent.insertChild(item, oldIndex);
    app.selectItem(newParent);
  }
}
export class Swap extends Action {
  constructor(item, diff) {
    super();
    this.item = item;
    this.parent = item.parent;
    let children = this.parent.children;
    let sibling = this.parent.resolvedLayout.pickSibling(item, diff);
    this.sourceIndex = children.indexOf(item);
    this.targetIndex = children.indexOf(sibling);
  }
  do() {
    this.parent.insertChild(this.item, this.targetIndex);
  }
  undo() {
    this.parent.insertChild(this.item, this.sourceIndex);
  }
}
export class SetLayout extends Action {
  constructor(item, layout) {
    super();
    this.item = item;
    this.layout = layout;
    this.oldLayout = item.layout;
  }
  do() {
    this.item.layout = this.layout;
  }
  undo() {
    this.item.layout = this.oldLayout;
  }
}
export class SetShape extends Action {
  constructor(item, shape) {
    super();
    this.item = item;
    this.shape = shape;
    this.oldShape = item.shape;
  }
  do() {
    this.item.shape = this.shape;
  }
  undo() {
    this.item.shape = this.oldShape;
  }
}
export class SetColor extends Action {
  constructor(item, color) {
    super();
    this.item = item;
    this.color = color;
    this.oldColor = item.color;
  }
  do() {
    this.item.color = this.color;
  }
  undo() {
    this.item.color = this.oldColor;
  }
}
export class SetTextColor extends Action {
  constructor(item, textColor) {
    super();
    this.item = item;
    this.textColor = textColor;
    this.oldTextColor = item.textColor;
  }
  do() {
    this.item.textColor = this.textColor;
  }
  undo() {
    this.item.textColor = this.oldTextColor;
  }
}
export class SetText extends Action {
  constructor(item, text) {
    super();
    this.item = item;
    this.text = text;
    this.oldText = item.text;
    this.oldValue = item.value; // adjusting text can also modify value!
  }
  do() {
    this.item.text = this.text;
    let numText = Number(this.text);
    // ルートノードは数値自動設定しない
    if (!this.item.isRoot && String(numText) == this.text) {
      this.item.value = numText;
    }
  }
  undo() {
    this.item.text = this.oldText;
    this.item.value = this.oldValue;
  }
}
export class SetValue extends Action {
  constructor(item, value) {
    super();
    this.item = item;
    this.value = value;
    this.oldValue = item.value;
  }
  do() {
    this.item.value = this.value;
  }
  undo() {
    this.item.value = this.oldValue;
  }
}
export class SetStatus extends Action {
  constructor(item, status) {
    super();
    this.item = item;
    this.status = status;
    this.oldStatus = item.status;
  }
  do() {
    this.item.status = this.status;
  }
  undo() {
    this.item.status = this.oldStatus;
  }
}
export class SetIcon extends Action {
  constructor(item, icon) {
    super();
    this.item = item;
    this.icon = icon;
    this.oldIcon = item.icon;
  }
  do() {
    this.item.icon = this.icon;
  }
  undo() {
    this.item.icon = this.oldIcon;
  }
}
export class SetSide extends Action {
  constructor(item, side) {
    super();
    this.item = item;
    this.side = side;
    this.oldSide = item.side;
  }
  do() {
    this.item.side = this.side;
  }
  undo() {
    this.item.side = this.oldSide;
  }
}
