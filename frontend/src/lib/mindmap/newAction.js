// newAction.js — action.js/history.js integration for the ?newEngine=1
// preview (Phase 4.6 of docs/08-mindmap-engine-refactor.md).
//
// Phase 1 of docs/08-phase6-mindmap-engine-refactor.md folded the
// Item/app-independent half of the old action.js directly into this
// file: the base Action class, Multi, every plain property-mutator
// Set* action, and the pickBalancedSide/pickInheritedShape tree-shape
// helpers. action.js itself is gone -- its only remaining classes
// (InsertNewItem, AppendItem, RemoveItem, MoveItem, Swap) always needed
// Item/app.selectItem(), a dependency this file never had, and this
// file already carried ItemNode-based equivalents of every one of them
// (see below).
//
// Property-only mutators (SetText, SetValue, SetStatus, SetColor,
// SetTextColor, SetIcon, SetUrl, SetSide, SetLayout, SetShape, Multi)
// only ever touch a public property setter (item.x = value), which
// ItemNode (the Phase 1 data store, see itemStore.js) exposes with the
// exact same API the old engine's Item did -- see
// docs/08-phase4-mindmap-engine-refactor.md's dependency inventory,
// section 7. No behavior changed in the move.
//
// Tree-mutation actions (InsertNewItem, AppendItem, RemoveItem,
// MoveItem, Swap) end their do()/undo() with a call to itemSelection.js's
// selectItem() rather than the old engine's app.selectItem() -- that was
// always the only difference from action.js's own versions; the
// tree-shape logic itself (pickBalancedSide/pickInheritedShape below) is
// unchanged from action.js's original implementation.
import * as history from "./history.js";
import { selectItem } from "./itemSelection.js";
import ItemNode from "./itemStore.js";

// Base class every action extends: a do()/undo() pair pushed onto
// history.js's shared undo stack via action() below.
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

// Returns the shape shared by every one of parent's existing children,
// or null if there are no children yet, or if any child has no explicit
// shape (unset) or they disagree. With exactly one existing child, that
// child's own shape is "shared" trivially, so a second sibling inherits
// it too instead of only kicking in once there are two or more.
export function pickInheritedShape(parent) {
  const { children } = parent;
  if (children.length < 1) {
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
export function pickBalancedSide(root) {
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
    const numText = Number(this.text);
    // Root nodes never auto-set a numeric value.
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
export class SetUrl extends Action {
  constructor(item, url) {
    super();
    this.item = item;
    this.url = url;
    this.oldUrl = item.url;
  }
  do() {
    this.item.url = this.url;
  }
  undo() {
    this.item.url = this.oldUrl;
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

// Mirrors my-mind.js's app.action(): pushes the action onto history.js's
// shared undo stack, then runs it. Every new-engine command that wants
// an undoable step (e.g. newEdit.js's commitEditing()) goes through
// this instead of mutating an ItemNode directly.
export function action(action) {
  history.push(action);
  action.do();
}

export class InsertNewItem extends Action {
  // See action.js's InsertNewItem for the full rationale of the `item`
  // parameter (reusing an already-constructed draft item so a
  // create-then-edit sequence is a single undo step).
  constructor(parent, index, item = null) {
    super();
    this.parent = parent;
    this.index = index;
    if (item) {
      this.item = item;
    } else {
      this.item = new ItemNode();
      this.item.isNew = true;
      if (parent.isRoot) {
        this.item.side = pickBalancedSide(parent);
      }
      if (parent.children.length >= 1) {
        const inheritedShape = pickInheritedShape(parent);
        if (inheritedShape) {
          this.item.shape = inheritedShape;
        }
      }
    }
  }
  do() {
    this.parent.collapsed = false;
    this.parent.insertChild(this.item, this.index);
    selectItem(this.item);
  }
  undo() {
    this.parent.removeChild(this.item);
    selectItem(this.parent);
  }
}

export class AppendItem extends Action {
  constructor(parent, item) {
    super();
    this.parent = parent;
    this.item = item;
  }
  do() {
    if (this.parent.isRoot && !this.item.side) {
      this.item.side = pickBalancedSide(this.parent);
    }
    this.parent.insertChild(this.item);
    selectItem(this.item);
  }
  undo() {
    this.parent.removeChild(this.item);
    selectItem(this.parent);
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
    selectItem(this.parent);
  }
  undo() {
    this.parent.insertChild(this.item, this.index);
    selectItem(this.item);
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
    item.side =
      newSide ?? (newParent.isRoot ? pickBalancedSide(newParent) : null);
    if (newIndex === undefined) {
      newParent.insertChild(item);
    } else {
      newParent.insertChild(item, newIndex);
    }
    selectItem(item);
  }
  undo() {
    const { item, oldSide, oldIndex, oldParent, newParent } = this;
    item.side = oldSide;
    oldParent.insertChild(item, oldIndex);
    selectItem(newParent);
  }
}

export class Swap extends Action {
  constructor(item, diff) {
    super();
    this.item = item;
    this.parent = item.parent;
    const children = this.parent.children;
    const sibling = this.parent.resolvedLayout.pickSibling(item, diff);
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
