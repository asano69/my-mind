// src/item.ts
import * as html from "./html.js";
import * as svg from "./svg.js";
import * as pubsub from "./pubsub.js";
import * as app from "./my-mind.js";
import { repo as commandRepo } from "./command/command.js";
import { repo as shapeRepo } from "./shape/shape.js";
import { repo as layoutRepo } from "./layout/layout.js";
import Map from "./map.js";
import { createSignal, createMemo } from "solid-js";

export const TOGGLE_SIZE = 7;

export default class Item {
  static fromJSON(data) {
    return new this().fromJSON(data);
  }
  constructor() {
    this._id = generateId();
    this.children = [];
    const [parent, setParent] = createSignal(null);
    this._parent = parent;
    this._setParent = setParent;
    // Phase 6 (Solid migration, see CLAUDE.md): these leaf properties are
    // backed by per-instance Solid signals instead of plain fields. Their
    // setters still call the full update() for now because value/status/icon
    // can affect content box size and collapsed can affect subtree layout, so
    // layout must still be recomputed. The direct DOM sync for each property
    // is driven by effects set up at the end of this constructor.
    const [text, setText] = createSignal("");
    this._text = text;
    this._setText = setText;
    const [collapsed, setCollapsed] = createSignal(false);
    this._collapsed = collapsed;
    this._setCollapsed = setCollapsed;
    const [icon, setIcon] = createSignal("");
    this._icon = icon;
    this._setIcon = setIcon;
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
    this._side = null; // side preference
    const [childrenVersion, setChildrenVersion] = createSignal(0);
    this._childrenVersion = childrenVersion;
    this._bumpChildrenVersion = () =>
      setChildrenVersion((version) => version + 1);
    const [shape, setShape] = createSignal(null);
    this._shape = shape;
    this._setShape = setShape;
    const [layout, setLayout] = createSignal(null);
    this._layout = layout;
    this._setLayout = setLayout;
    this._resolvedColor = createMemo(() => {
      const color = this._color();
      if (color && color !== "#ffffff") {
        return color;
      }
      const parent = this.parent;
      if (parent instanceof Item) {
        return parent.resolvedColor;
      }
      return COLOR;
    });
    this._resolvedTextColor = createMemo(() => {
      const textColor = this._textColor();
      if (textColor && textColor !== "#ffffff") {
        return textColor;
      }
      const parent = this.parent;
      if (parent instanceof Item) {
        return parent.resolvedTextColor;
      }
      return "";
    });
    this._resolvedValue = createMemo(() => {
      this._childrenVersion();
      const value = this._value();
      if (typeof value == "number") {
        return value;
      }
      let childValues = this.children.map((child) => child.resolvedValue);
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
      if (parent instanceof Item) {
        return parent._resolvedLayout();
      }
      return null;
    });
    this._depth = createMemo(() => {
      let depth = 0;
      let node = this;
      while (node.parent instanceof Item) {
        depth++;
        node = node.parent;
      }
      return depth;
    });
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
    this.originalText = "";
    this.dom = {
      node: svg.group(),
      connectors: svg.group(),
      content: html.node("div"),
      notes: html.node("div"),
      status: html.node("span"),
      icon: html.node("span"),
      value: html.node("span"),
      text: html.node("div"),
      toggle: buildToggle(),
    };
    const { dom } = this;
    dom.node.classList.add("item");
    dom.content.classList.add("content");
    dom.notes.classList.add("notes");
    dom.status.classList.add("status");
    dom.icon.classList.add("icon");
    dom.value.classList.add("value");
    dom.text.classList.add("text");
    dom.icon.classList.add("icon");
    this.updateNotes(); // hide the node before the first effect run
    let fo = svg.foreignObject();
    dom.node.append(dom.connectors, fo);
    fo.append(dom.content);
    dom.content.append(dom.status, dom.value, dom.icon, dom.text, dom.notes);
    dom.toggle.addEventListener("click", (_) => {
      this.collapsed = !this.collapsed;
      app.selectItem(this);
    });
    this.updateToggle();
    // updateText/updateStatus/updateValue/updateIcon/updateNotes/updateToggle
    // are no longer wrapped in per-item effects here — Map's single
    // reactive layout computed (see map.js, Solid migration Phase 8) calls
    // them directly while recomputing the whole tree, so DOM content sync
    // and size measurement always happen in the same synchronous pass.
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
  get size() {
    const bbox = this.dom.node.getBBox();
    return [bbox.width, bbox.height];
  }
  get position() {
    const { node } = this.dom;
    const transform = node.getAttribute("transform");
    return transform.match(/\d+/g).map(Number); // fixme store in some property?
  }
  set position(position) {
    const { node } = this.dom;
    const transform = `translate(${position.join(" ")})`;
    node.setAttribute("transform", transform);
  }
  get contentSize() {
    const { content } = this.dom;
    const fo = content.parentNode;
    return [fo.getAttribute("width"), fo.getAttribute("height")].map(Number);
  }
  get contentPosition() {
    const { content } = this.dom;
    const fo = content.parentNode;
    return [fo.getAttribute("x"), fo.getAttribute("y")].map(Number);
  }
  set contentPosition(position) {
    const { content } = this.dom;
    const fo = content.parentNode;
    fo.setAttribute("x", String(position[0]));
    fo.setAttribute("y", String(position[1]));
  }
  toJSON() {
    let data = {
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
      this._side = data.side;
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
    } // invoke setter -> set text
    if (data.layout) {
      this._setLayout(layoutRepo.get(data.layout));
    }
    if (data.shape) {
      this.shape = shapeRepo.get(data.shape);
    }
    (data.children || []).forEach((child) => {
      this.insertChild(Item.fromJSON(child));
    });
    return this;
  }
  mergeWith(data) {
    if (this.text != data.text && !this.dom.text.contentEditable) {
      this.text = data.text;
    }
    if (this._side != data.side) {
      this._side = data.side || null;
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
    if (this._value() != data.value) {
      this._setValue(data.value || null);
    }
    if (this._status() != data.status) {
      this._setStatus(data.status);
    }
    if (this._collapsed() != !!data.collapsed) {
      this.collapsed = !!data.collapsed;
    }
    // fixme does not work
    let ourShapeId = this._shape() ? this._shape().id : null;
    if (ourShapeId != data.shape) {
      this._setShape(data.shape ? shapeRepo.get(data.shape) : null);
    }
    let ourLayoutId = this._layout() ? this._layout().id : null;
    if (ourLayoutId != data.layout) {
      this._setLayout(data.layout ? layoutRepo.get(data.layout) : null);
    }
    (data.children || []).forEach((child, index) => {
      if (index >= this.children.length) {
        this.insertChild(Item.fromJSON(child));
      } else {
        var myChild = this.children[index];
        if (myChild.id == child.id) {
          myChild.mergeWith(child);
        } else {
          this.removeChild(this.children[index]);
          this.insertChild(Item.fromJSON(child), index);
        }
      }
    });
    let newLength = (data.children || []).length;
    while (this.children.length > newLength) {
      this.removeChild(this.children[this.children.length - 1]);
    }
    // `side` is a plain (non-reactive) field — per CLAUDE.md's Phase 6 note
    // on MapLayout.getChildDirection — so it needs an explicit nudge here;
    // simpler to do it unconditionally than to track which field changed.
    this.map?.requestLayout();
  }
  clone() {
    var data = this.toJSON();
    var removeId = function (obj) {
      delete obj.id;
      obj.children && obj.children.forEach(removeId);
    };
    removeId(data);
    return Item.fromJSON(data);
  }
  select() {
    this.dom.node.classList.add("current");
  }
  deselect() {
    this.dom.node.classList.remove("current");
  }
  /** Mark this item as part of a multi-selection (Ctrl/Cmd+click). */
  markSelected() {
    this.dom.node.classList.add("selected");
  }
  /** Remove the multi-selection mark from this item. */
  unmarkSelected() {
    this.dom.node.classList.remove("selected");
  }
  /*
   * This item changed in some way (typically one of its attributes has been changed).
   * We need to re-render its immediate DOM and also prehaps recurse upwards/downwards.
   *
   * Nothing happens if not part of a map (or the map is not visible).
   */
  update(options = {}) {
    options = Object.assign({}, UPDATE_OPTIONS, options);
    const { map, children, parent } = this;
    if (!map || !map.isVisible) {
      return;
    }
    if (options.children) {
      // recurse downwards?
      let childUpdateOptions = { parent: false, children: true };
      children.forEach((child) => child.update(childUpdateOptions));
    }
    pubsub.publish("item-change", this);
    const { resolvedLayout, resolvedShape, dom } = this;

    const { content, node, connectors } = dom;
    dom.text.style.color = this.resolvedTextColor;
    node.dataset.shape = resolvedShape.id; // applies css => modifies dimensions (necessary for layout)
    node.dataset.align = resolvedLayout.computeAlignment(this); // applies css => modifies dimensions (necessary for layout)
    let fo = content.parentNode;
    let size = [
      Math.max(content.offsetWidth, content.scrollWidth),
      Math.max(content.offsetHeight, content.scrollHeight),
    ];
    fo.setAttribute("width", String(size[0]));
    fo.setAttribute("height", String(size[1]));
    connectors.innerHTML = "";
    resolvedLayout.update(this);
    resolvedShape.update(this); // needs layout -> draws second
    // recurse upwards?
    if (options.parent && parent) {
      parent.update({ children: false });
    } // explicit children:false when the parent is a Map
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
  get side() {
    return this._side;
  }
  set side(side) {
    this._side = side;
    // no .update() call, because the whole map needs updating
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
  get map() {
    let item = this.parent;
    while (item) {
      if (item instanceof Map) {
        return item;
      }
      item = item.parent;
    }
    return null;
  }
  get isRoot() {
    return this.parent instanceof Map;
  }
  insertChild(child, index) {
    // Create or remove child as necessary. This must be done before computing the index (inserting own child)
    if (!child) {
      child = new Item();
    } else if (child.parent && child.parent instanceof Item) {
      // only when the child has non-map parent
      child.parent.removeChild(child);
    }
    if (!this.children.length) {
      this.dom.node.appendChild(this.dom.toggle);
    }
    if (index === undefined) {
      index = this.children.length;
    }
    var next = null;
    if (index < this.children.length) {
      next = this.children[index].dom.node;
    }
    this.dom.node.insertBefore(child.dom.node, next);
    this.children.splice(index, 0, child);
    this._bumpChildrenVersion();
    child.parent = this;
  }
  removeChild(child) {
    var index = this.children.indexOf(child);
    this.children.splice(index, 1);
    this._bumpChildrenVersion();
    child.dom.node.remove();
    child.parent = null;
    !this.children.length && this.dom.toggle.remove();
  }
  startEditing() {
    this.originalText = this.text;
    this.dom.text.contentEditable = "true";
    this.dom.text.focus();
    document.execCommand("styleWithCSS", false, "false");
    this.dom.text.addEventListener("input", this);
    this.dom.text.addEventListener("keydown", this);
    this.dom.text.addEventListener("blur", this);
  }
  stopEditing() {
    this.dom.text.removeEventListener("input", this);
    this.dom.text.removeEventListener("keydown", this);
    this.dom.text.removeEventListener("blur", this);
    this.dom.text.blur();
    this.dom.text.contentEditable = "false";
    let result = this.dom.text.innerHTML;
    this.dom.text.innerHTML = this.originalText;
    this.originalText = "";
    return result;
  }
  handleEvent(e) {
    switch (e.type) {
      case "input":
        this.map.requestLayout();
        this.map.ensureItemVisibility(this);
        break;
      case "keydown":
        if (e.code == "Tab") {
          e.preventDefault();
        } // TAB has a special meaning in this app, do not use it to change focus
        break;
      case "blur":
        commandRepo.get("finish").execute();
        break;
    }
  }
  updateText() {
    const text = this._text();
    if (this.dom.text.innerHTML == text) {
      return;
    }
    this.dom.text.innerHTML = text;
    findLinks(this.dom.text);
  }

  updateStatus() {
    const { resolvedStatus, dom } = this;
    dom.status.className = "status";
    dom.status.hidden = false;
    switch (resolvedStatus) {
      case true:
        dom.status.classList.add("yes");
        break;
      case false:
        dom.status.classList.add("no");
        break;
      default:
        dom.status.hidden = true;
        break;
    }
  }
  updateIcon() {
    var icon = this._icon();
    this.dom.icon.className = "icon"; // completely reset
    this.dom.icon.hidden = !icon;
    if (icon) {
      this.dom.icon.classList.add("fa");
      this.dom.icon.classList.add(icon);
    }
  }
  updateValue() {
    const { dom } = this;
    const value = this._value();
    if (value === null) {
      dom.value.hidden = true;
      return;
    }
    dom.value.hidden = false;
    if (typeof value == "number") {
      // exact values are not rounded
      dom.value.textContent = String(value);
    } else {
      let resolved = this.resolvedValue; // computed values are rounded to 3 decimals if need rounding
      dom.value.textContent = String(
        Math.round(resolved) == resolved ? resolved : resolved.toFixed(3),
      );
    }
  }
  updateNotes() {
    const notes = this._notes();
    this.dom.notes.hidden = !notes;
  }
  updateToggle() {
    const { node, toggle } = this.dom;
    node.classList.toggle("collapsed", this._collapsed());
    toggle
      .querySelector("path")
      .setAttribute("d", this._collapsed() ? D_PLUS : D_MINUS);
  }
}
function findLinks(node) {
  let children = [...node.childNodes];
  for (let i = 0; i < children.length; i++) {
    let child = children[i];
    if (child instanceof Element) {
      if (child.nodeName.toLowerCase() == "a") {
        continue;
      }
      findLinks(child);
    }
    if (child instanceof Text) {
      let str = child.nodeValue;
      let result = str.match(RE);
      if (!result) {
        continue;
      }
      let before = str.substring(0, result.index);
      let after = str.substring(result.index + result[0].length);
      var link = document.createElement("a");
      link.innerHTML = link.href = result[0];
      if (before) {
        node.insertBefore(document.createTextNode(before), child);
      }
      node.insertBefore(link, child);
      if (after) {
        child.nodeValue = after;
        i--; // re-try with the aftertext
      } else {
        child.remove();
      }
    }
  }
}
function generateId() {
  let str = "";
  for (var i = 0; i < 8; i++) {
    let code = Math.floor(Math.random() * 26);
    str += String.fromCharCode("a".charCodeAt(0) + code);
  }
  return str;
}
const D_MINUS = `M ${-(TOGGLE_SIZE - 2)} 0 L ${TOGGLE_SIZE - 2} 0`;
const D_PLUS = `${D_MINUS} M 0 ${-(TOGGLE_SIZE - 2)} L 0 ${TOGGLE_SIZE - 2}`;
function buildToggle() {
  const circleAttrs = { cx: "0", cy: "0", r: String(TOGGLE_SIZE) };
  let g = svg.group();
  g.classList.add("toggle");
  g.append(svg.node("circle", circleAttrs), svg.node("path"));
  return g;
}
const COLOR = "#999";
/* RE explanation:
 *            _________________________________________________________________________ One of the three possible variants
 *             ____________________ scheme://x
 *                                  ___________________________ aa.bb.cc
 *                                                              _______________________ aa.bb/
 *                                                                                      ______ path, search
 *                                                                                            __________________________ end with a non-forbidden char
 *                                                                                                                      ______ end of word or end of string
 */
const RE =
  /\b(([a-z][\w-]+:\/\/\w)|(([\w-]+\.){2,}[a-z][\w-]+)|([\w-]+\.[a-z][\w-]+\/))[^\s]*([^\s,.;:?!<>\(\)\[\]'"])?($|\b)/i;
