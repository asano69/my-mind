// itemStore.js — plain, DOM-free reactive tree data model.
//
// Phase 1 of docs/08-mindmap-engine-refactor.md: splits the "data" half
// of the current item.js Item class out from its "DOM ownership" half.
// A node created here holds signal-backed properties and computed
// (memo) inheritance/aggregation getters, but never touches an SVG or
// HTML element -- nothing in this file imports html.js/svg.js. item.js
// still owns rendering until a later phase replaces it with JSX (see
// doc08's Phase 2 onward); this module is only read by tests today.
//
// Field-for-field this mirrors item.js's own signal-backed properties
// (text/notes/collapsed/icon/url/side/color/textColor/value/status/
// shape/layout) and its resolvedXxx inheritance/aggregation memos --
// the computation logic itself is copied unchanged from item.js, only
// the DOM side effects (updateText(), etc.) and DOM-node fields are
// dropped. action.js's tree-shape helpers (pickBalancedSide,
// pickInheritedShape) are deliberately NOT duplicated here, per the
// plan -- they already only touch `.side`/`.shape`/`.children`/
// `.isRoot`, which this node exposes with the same API, so they can be
// wired up against ItemNode unchanged in a later phase.
import { createSignal, createMemo, createRoot, batch } from "solid-js";
import { repo as shapeRepo } from "./shape/shape.js";
import { repo as layoutRepo } from "./layout/layout.js";

const DEFAULT_COLOR = "#999";

function generateId() {
  let str = "";
  for (let i = 0; i < 8; i++) {
    const code = Math.floor(Math.random() * 26);
    str += String.fromCharCode("a".charCodeAt(0) + code);
  }
  return str;
}

export default class ItemNode {
  static fromJSON(data) {
    return new this().fromJSON(data);
  }

  constructor() {
    this._id = generateId();
    this.children = [];
    // Draft-node marker, matching item.js's own isNew field -- set only
    // by whatever later phase reimplements action.js's InsertNewItem
    // against this store.
    this.isNew = false;

    const [parent, setParent] = createSignal(null);
    this._parent = parent;
    this._setParent = setParent;

    const [text, setText] = createSignal("");
    this._text = text;
    this._setText = setText;

    const [collapsed, setCollapsed] = createSignal(false);
    this._collapsed = collapsed;
    this._setCollapsed = setCollapsed;

    const [icon, setIcon] = createSignal("");
    this._icon = icon;
    this._setIcon = setIcon;

    const [url, setUrl] = createSignal("");
    this._url = url;
    this._setUrl = setUrl;

    const [notes, setNotes] = createSignal("");
    this._notes = notes;
    this._setNotes = setNotes;

    const [color, setColor] = createSignal("");
    this._color = color;
    this._setColor = setColor;

    const [textColor, setTextColor] = createSignal("");
    this._textColor = textColor;
    this._setTextColor = setTextColor;

    const [value, setValue] = createSignal(null);
    this._value = value;
    this._setValue = setValue;

    const [status, setStatus] = createSignal(null);
    this._status = status;
    this._setStatus = setStatus;

    // Plain field, not signal-backed -- mirrors item.js's own `side`
    // (see that file's Phase 6 note on MapLayout.getChildDirection's
    // side-effect read). `_sideVersion` is the explicit change marker
    // a future layout memo can depend on instead.
    this._side = null;
    const [sideVersion, setSideVersion] = createSignal(0);
    this._sideVersion = sideVersion;
    this._bumpSideVersion = () => setSideVersion((v) => v + 1);

    const [childrenVersion, setChildrenVersion] = createSignal(0);
    this._childrenVersion = childrenVersion;
    this._bumpChildrenVersion = () => setChildrenVersion((v) => v + 1);

    const [shape, setShape] = createSignal(null);
    this._shape = shape;
    this._setShape = setShape;

    const [layout, setLayout] = createSignal(null);
    this._layout = layout;
    this._setLayout = setLayout;

    // The memos below are computations, so Solid needs an owning root
    // (see item.js's constructor comment for the identical reasoning).
    // Nodes aren't explicitly torn down today -- they're just dropped
    // from the tree and garbage collected -- so `dispose` is kept for
    // future use rather than called anywhere right now.
    createRoot((dispose) => {
      this._disposeMemos = dispose;

      this._resolvedColor = createMemo(() => {
        const own = this._color();
        if (own && own !== "#ffffff") {
          return own;
        }
        const parent = this.parent;
        return parent instanceof ItemNode ? parent.resolvedColor : DEFAULT_COLOR;
      });

      this._resolvedTextColor = createMemo(() => {
        const own = this._textColor();
        if (own && own !== "#ffffff") {
          return own;
        }
        const parent = this.parent;
        return parent instanceof ItemNode ? parent.resolvedTextColor : "";
      });

      this._resolvedValue = createMemo(() => {
        this._childrenVersion();
        const value = this._value();
        if (typeof value == "number") {
          return value;
        }
        const childValues = this.children.map((child) => child.resolvedValue);
        switch (value) {
          case "max":
            return Math.max(...childValues);
          case "min":
            return Math.min(...childValues);
          case "sum":
            return childValues.reduce((prev, cur) => prev + cur, 0);
          case "avg": {
            const sum = childValues.reduce((prev, cur) => prev + cur, 0);
            return childValues.length ? sum / childValues.length : 0;
          }
          default:
            return 0;
        }
      });

      this._resolvedStatus = createMemo(() => {
        this._childrenVersion();
        const status = this._status();
        if (status == "computed") {
          return this.children.every((child) => child.resolvedStatus !== false);
        }
        return status;
      });

      this._resolvedLayout = createMemo(() => {
        const layout = this._layout();
        if (layout) {
          return layout;
        }
        const parent = this.parent;
        return parent instanceof ItemNode ? parent._resolvedLayout() : null;
      });

      this._depth = createMemo(() => {
        let depth = 0;
        let node = this;
        while (node.parent instanceof ItemNode) {
          depth++;
          node = node.parent;
        }
        return depth;
      });

      // Same as item.js: shape is intentionally NOT inherited from an
      // ancestor's explicit shape. An item with no explicit shape of
      // its own always falls back to the depth-based default,
      // regardless of what shape any ancestor has set.
      this._resolvedShape = createMemo(() => {
        const shape = this._shape();
        if (shape) {
          return shape;
        }
        switch (this._depth()) {
          case 0:
            return shapeRepo.get("ellipse");
          case 1:
            return shapeRepo.get("box");
          default:
            return shapeRepo.get("underline");
        }
      });
    });
  }

  get id() {
    return this._id;
  }

  get parent() {
    return this._parent();
  }
  set parent(parent) {
    this._setParent(parent);
  }

  // A node with no parent is a root -- unlike item.js (which checks
  // `instanceof Map`), this store has no separate Map/DOM wrapper
  // class, so "no parent" is the root condition directly.
  get isRoot() {
    return this.parent === null;
  }

  get text() {
    return this._text();
  }
  set text(text) {
    this._setText(text);
  }

  get notes() {
    return this._notes();
  }
  set notes(notes) {
    this._setNotes(notes);
  }

  get collapsed() {
    return this._collapsed();
  }
  set collapsed(collapsed) {
    this._setCollapsed(collapsed);
  }

  get value() {
    return this._value();
  }
  set value(value) {
    this._setValue(value);
  }
  get resolvedValue() {
    return this._resolvedValue();
  }

  get status() {
    return this._status();
  }
  set status(status) {
    this._setStatus(status);
  }
  get resolvedStatus() {
    return this._resolvedStatus();
  }

  get icon() {
    return this._icon();
  }
  set icon(icon) {
    this._setIcon(icon);
  }

  get url() {
    return this._url();
  }
  set url(url) {
    this._setUrl(url);
  }

  get side() {
    return this._side;
  }
  set side(side) {
    this._setSide(side);
  }
  _setSide(side, { bump = true } = {}) {
    if (this._side === side) {
      return;
    }
    this._side = side;
    if (bump) {
      this._bumpSideVersion();
    }
  }

  get color() {
    return this._color();
  }
  set color(color) {
    this._setColor(color);
  }
  get resolvedColor() {
    return this._resolvedColor();
  }

  get textColor() {
    return this._textColor();
  }
  set textColor(textColor) {
    this._setTextColor(textColor);
  }
  get resolvedTextColor() {
    return this._resolvedTextColor();
  }

  get layout() {
    return this._layout();
  }
  set layout(layout) {
    this._setLayout(layout);
  }
  get resolvedLayout() {
    const layout = this._resolvedLayout();
    if (!layout) {
      throw new Error("Non-connected item does not have layout");
    }
    return layout;
  }

  get shape() {
    return this._shape();
  }
  set shape(shape) {
    this._setShape(shape);
  }
  get resolvedShape() {
    return this._resolvedShape();
  }

  // Wrapped in batch() for the same reason as item.js's insertChild():
  // without it, a synchronous reader (a future layout memo) could
  // observe the moment where `child` is already in this.children but
  // child.parent still points at the old parent (or null).
  insertChild(child, index) {
    batch(() => {
      if (!child) {
        child = new ItemNode();
      } else if (child.parent instanceof ItemNode) {
        child.parent.removeChild(child);
      }
      if (index === undefined) {
        index = this.children.length;
      }
      this.children.splice(index, 0, child);
      child.parent = this;
      this._bumpChildrenVersion();
    });
  }

  removeChild(child) {
    batch(() => {
      const index = this.children.indexOf(child);
      if (index === -1) {
        return;
      }
      this.children.splice(index, 1);
      child.parent = null;
      this._bumpChildrenVersion();
    });
  }

  toJSON() {
    const data = {
      id: this.id,
      text: this.text,
      notes: this.notes,
    };
    if (this._side) {
      data.side = this._side;
    }
    if (this._color()) {
      data.color = this._color();
    }
    if (this._textColor()) {
      data.textColor = this._textColor();
    }
    if (this._icon()) {
      data.icon = this._icon();
    }
    if (this._url()) {
      data.url = this._url();
    }
    if (this._value() !== null) {
      data.value = this._value();
    }
    if (this._status() !== null) {
      data.status = this._status();
    }
    if (this._layout()) {
      data.layout = this._layout().id;
    }
    if (this._shape()) {
      data.shape = this._shape().id;
    }
    if (this._collapsed()) {
      data.collapsed = true;
    }
    if (this.children.length) {
      data.children = this.children.map((child) => child.toJSON());
    }
    return data;
  }

  /**
   * Only when creating a new item. To merge existing items, use .mergeWith().
   */
  fromJSON(data) {
    this.text = data.text;
    if (data.id) {
      this._id = data.id;
    }
    if (data.notes) {
      this.notes = data.notes;
    }
    if (data.side) {
      this._setSide(data.side, { bump: false });
    }
    if (data.color) {
      this._setColor(data.color);
    }
    if (data.textColor) {
      this._setTextColor(data.textColor);
    }
    if (data.icon) {
      this._setIcon(data.icon);
    }
    if (data.url) {
      this._setUrl(data.url);
    }
    if (data.value !== undefined) {
      this._setValue(data.value);
    }
    if (data.status !== undefined) {
      // backwards compatibility for yes/no
      if (data.status == "yes") {
        this._setStatus(true);
      } else if (data.status == "no") {
        this._setStatus(false);
      } else {
        this._setStatus(data.status);
      }
    }
    if (data.collapsed) {
      this.collapsed = !!data.collapsed;
    }
    if (data.layout) {
      this._setLayout(layoutRepo.get(data.layout));
    }
    if (data.shape) {
      this.shape = shapeRepo.get(data.shape);
    }
    (data.children || []).forEach((child) => {
      this.insertChild(ItemNode.fromJSON(child));
    });
    return this;
  }

  // Unlike item.js's mergeWith(), there is no live-editing DOM state to
  // guard against here (no contentEditable), so text is always
  // overwritten directly -- that guard belongs to whatever later phase
  // wires a live-edit signal into this store.
  mergeWith(data) {
    if (this.text != data.text) {
      this.text = data.text;
    }
    if (this._side != data.side) {
      this._setSide(data.side || null);
    }
    if (this._color() != data.color) {
      this._setColor(data.color || "");
    }
    if (this._textColor() != data.textColor) {
      this._setTextColor(data.textColor || "");
    }
    if (this._icon() != data.icon) {
      this._setIcon(data.icon || "");
    }
    if (this._url() != data.url) {
      this._setUrl(data.url || "");
    }
    if (this._value() != data.value) {
      this._setValue(data.value || null);
    }
    if (this._status() != data.status) {
      this._setStatus(data.status);
    }
    if (this._collapsed() != !!data.collapsed) {
      this.collapsed = !!data.collapsed;
    }
    const ourShapeId = this._shape() ? this._shape().id : null;
    if (ourShapeId != data.shape) {
      this._setShape(data.shape ? shapeRepo.get(data.shape) : null);
    }
    const ourLayoutId = this._layout() ? this._layout().id : null;
    if (ourLayoutId != data.layout) {
      this._setLayout(data.layout ? layoutRepo.get(data.layout) : null);
    }
    (data.children || []).forEach((child, index) => {
      if (index >= this.children.length) {
        this.insertChild(ItemNode.fromJSON(child));
      } else {
        const myChild = this.children[index];
        if (myChild.id == child.id) {
          myChild.mergeWith(child);
        } else {
          this.removeChild(this.children[index]);
          this.insertChild(ItemNode.fromJSON(child), index);
        }
      }
    });
    const newLength = (data.children || []).length;
    while (this.children.length > newLength) {
      this.removeChild(this.children[this.children.length - 1]);
    }
  }

  clone() {
    const data = this.toJSON();
    const removeId = (obj) => {
      delete obj.id;
      obj.children && obj.children.forEach(removeId);
    };
    removeId(data);
    return ItemNode.fromJSON(data);
  }
}
