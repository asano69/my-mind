// newAction.js — action.js/history.js integration for the ?newEngine=1
// preview (Phase 4.6 of docs/08-mindmap-engine-refactor.md).
//
// Property-only mutators (SetText, SetValue, SetStatus, SetColor,
// SetTextColor, SetIcon, SetUrl, SetSide, SetLayout, SetShape, Multi)
// are re-exported directly from action.js, unchanged: they only ever
// touch a public property setter (item.x = value), which ItemNode (the
// Phase 1 data store, see itemStore.js) exposes with the exact same API
// as item.js's Item -- see docs/08-phase4-mindmap-engine-refactor.md's
// dependency inventory, section 7.
//
// Tree-mutation actions (InsertNewItem, AppendItem, RemoveItem,
// MoveItem, Swap) are reimplemented here rather than reused: action.js's
// own versions end their do()/undo() with a call to my-mind.js's
// app.selectItem() (the old engine's global selection), but the new
// engine's selection lives in itemSelection.js instead (see that
// module's own comment). Only the selection call site differs -- the
// tree-shape logic itself (pickBalancedSide/pickInheritedShape) is
// imported from action.js, not duplicated, per the same section's own
// note that these helpers already only touch `.side`/`.shape`/
// `.children`/`.isRoot`, which ItemNode exposes identically.
import * as history from "./history.js";
import { selectItem } from "./itemSelection.js";
import Action, {
  Multi,
  SetLayout,
  SetShape,
  SetColor,
  SetTextColor,
  SetText,
  SetValue,
  SetStatus,
  SetIcon,
  SetUrl,
  SetSide,
  pickBalancedSide,
  pickInheritedShape,
} from "./action.js";
import ItemNode from "./itemStore.js";

export {
  Multi,
  SetLayout,
  SetShape,
  SetColor,
  SetTextColor,
  SetText,
  SetValue,
  SetStatus,
  SetIcon,
  SetUrl,
  SetSide,
};

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
