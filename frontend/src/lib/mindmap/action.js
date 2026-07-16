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
  constructor(parent, index) {
    super();
    this.parent = parent;
    this.index = index;
    this.item = new Item();
  }
  do() {
    this.parent.collapsed = false; // FIXME remember?
    this.parent.insertChild(this.item, this.index);
    app.selectItem(this.item);
  }
  undo() {
    this.parent.removeChild(this.item);
    app.selectItem(this.parent);
  }
}
export class AppendItem extends Action {
  constructor(parent, item) {
    super();
    this.parent = parent;
    this.item = item;
  }
  do() {
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
    item.side = newSide;
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
    this.item.map?.requestLayout();
  }
  undo() {
    this.item.side = this.oldSide;
    this.item.map?.requestLayout();
  }
}
