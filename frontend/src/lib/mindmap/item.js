// src/item.js
import {
  createSignal,
  createMemo,
  createRoot,
  createEffect,
  batch,
} from "solid-js";
import * as html from "./html.js";
import * as svg from "./svg.js";

import * as app from "./my-mind.js";
import { repo as commandRepo } from "./command/command.js";
import { repo as shapeRepo } from "./shape/shape.js";
import { repo as layoutRepo } from "./layout/layout.js";
import Map from "./map.js";

export const TOGGLE_SIZE = 7;
const LAYOUT_RESULT = Symbol("Item.layoutResult");

export function readItemLayoutResult(item) {
  return item[LAYOUT_RESULT]();
}

// Set by Workspace.jsx (the nearest ancestor rendered inside
// @solidjs/router's <Router>) so same-origin link clicks below can use
// Solid Router's client-side navigation instead of a full page reload.
// item.js itself is a plain vanilla module with no router context of its
// own, so this mirrors the registerEditorAPI bridge pattern notes.js
// already uses for the same "vanilla module needs to reach into
// Solid-owned APIs" problem.
let navigateFn = null;
export function registerNavigate(fn) {
  navigateFn = fn;
}

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
    this._side = null; // side preference
    const [sideVersion, setSideVersion] = createSignal(0);
    this._sideVersion = sideVersion;
    this._bumpSideVersion = () => setSideVersion((version) => version + 1);
    const [contentVersion, setContentVersion] = createSignal(0);
    this._contentVersion = contentVersion;
    this._bumpContentVersion = () =>
      setContentVersion((version) => version + 1);
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

    // The memos below are computations, so Solid needs an owning root or
    // it warns "computations created outside a createRoot or render will
    // never be disposed" (see CLAUDE.md's "vanilla module effects need
    // createRoot" rule — item.js was the one place not following it,
    // since Items are constructed directly, not from within a Solid
    // component tree). Items aren't explicitly torn down today (they're
    // just dropped from the tree and garbage collected, same as Map's own
    // layout computed in map.js), so `dispose` is kept for future use
    // rather than called anywhere right now.
    createRoot((dispose) => {
      this._disposeMemos = dispose;
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
      // Memoized boolean, not the raw notes text: map.js's shared
      // layout computed only reruns when a tracked memo's *value*
      // changes, so depending on this (rather than _notes() itself)
      // keeps every keystroke in the notes editor from retriggering a
      // full-tree layout recompute. Only an empty<->non-empty
      // transition needs to redraw the badge.
      this._hasNotes = createMemo(() => !!this._notes());
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
      // Unlike resolvedColor/resolvedTextColor, shape is intentionally
      // NOT inherited from an ancestor's explicit shape -- changing a
      // node's shape must only affect that node itself. An item with no
      // explicit shape of its own always falls back to the depth-based
      // default, regardless of what shape any ancestor has set.
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

    this.originalText = "";
    // Set true only by action.js's InsertNewItem (i.e. a node just
    // created via InsertSibling/InsertChild). Cleared the first time
    // Finish commits non-empty text, or the item is removed outright if
    // left empty (see command/edit.js's Finish command). Plain instance
    // field, not signal-backed: it's a one-shot marker, not something any
    // UI needs to react to.
    this.isNew = false;
    this.dom = {
      node: svg.group(),
      connectors: svg.group(),
      content: html.node("div"),
      notes: html.node("div"),
      status: html.node("span"),
      icon: html.node("span"),
      value: html.node("span"),
      text: html.node("div"),
      link: html.node("span"),
      toggle: buildToggle(),
    };
    const { dom } = this;
    dom.node.classList.add("item");
    dom.content.classList.add("content");
    dom.notes.classList.add("notes");
    dom.notes.append(buildNotesIcon());
    dom.status.classList.add("status");
    dom.icon.classList.add("icon");
    dom.value.classList.add("value");
    dom.text.classList.add("text");
    dom.icon.classList.add("icon");
    dom.link.classList.add("link-icon");
    dom.link.append(buildLinkIcon());
    let fo = svg.foreignObject();
    dom.node.append(dom.connectors, fo);
    fo.append(dom.content);
    // dom.link is appended inline at the end of dom.text's own content
    // (see updateText() below), not here as a separate flex sibling of
    // .content -- keeping it a flex sibling caused it to overlap the
    // label text under some layouts/shapes instead of trailing it.
    dom.content.append(dom.status, dom.value, dom.icon, dom.text, dom.notes);
    dom.toggle.addEventListener("click", (_) => {
      this.collapsed = !this.collapsed;
      app.selectItem(this);
    });
    // Opens this item's url. Same-origin links use Solid Router's
    // navigate() (registered via registerNavigate() above) for a
    // client-side transition instead of a full page reload; external
    // links open in a new tab as before. Deliberately not stopping
    // propagation: the click still bubbles up to mouse.js's own click
    // listener afterwards, which selects the item as usual (per spec:
    // clicking the 🔗 both opens the link and selects the node).
    dom.link.addEventListener("click", () => {
      const url = this._url();
      if (!url) {
        return;
      }
      if (isSameOrigin(url) && navigateFn) {
        const target = new URL(url, window.location.href);
        navigateFn(target.pathname + target.search + target.hash);
      } else if (isSameOrigin(url)) {
        // Same-origin but no navigate() registered yet (e.g. router not
        // mounted): fall back to a normal same-tab navigation.
        window.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    });
    // updateStatus/updateValue are still called directly from
    // computeLayout() below, since resolvedStatus/resolvedValue read
    // child-aggregated memos and must stay inside the post-order layout
    // pass (see docs/06.1-recursive-memo-layout-refactor.md, Phase 7).
    // updateText/updateIcon/updateNotes/updateToggle only touch this
    // item's own DOM and never read child/parent state, so they run as
    // independent per-item effects instead -- a leaf node's text edit (or
    // a collapse toggle) no longer needs to pull through the whole layout
    // memo chain just to sync its own label/icon/toggle glyph.
    createRoot((dispose) => {
      this._disposeContentEffects = dispose;
      createEffect(() => this.updateText());
      createEffect(() => this.updateIcon());
      createEffect(() => this.updateNotes());
      createEffect(() => this.updateToggle());
      createEffect(() => this.updateLink());
    });

    createRoot((dispose) => {
      this._disposeLayoutMemo = dispose;
      this[LAYOUT_RESULT] = createMemo(() => computeLayout(this));
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
    const wasCollapsed = this._collapsed();
    this._setCollapsed(collapsed);
    if (wasCollapsed === collapsed) {
      return;
    }
    // Foreign-object-in-SVG paint quirk (see map.js's show() for the
    // fuller explanation, and insertChild() below for the same fix
    // applied to fresh insertions): toggling the "collapsed" CSS class
    // happens in a separate per-item effect (updateToggle()), so a
    // synchronous getBBox()/offsetWidth read right after flipping this
    // signal can race that class actually being applied and painted.
    // Force one more remeasure pass, after the browser actually paints,
    // mirroring both directions of the transition:
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (collapsed) {
          // Collapsing: this item's own footprint shrinks (its children
          // are now display:none and excluded from its bbox/layout), so
          // only this item itself needs remeasuring -- its ancestors then
          // repack around the new, smaller size via the usual recursive
          // memo chain. Its children stay hidden and untouched.
          this._bumpContentVersion();
        } else {
          // Expanding: descendants were hidden and may have gone stale
          // while invisible; remeasure the whole revealed subtree.
          this.children.forEach((child) => child._bumpSubtreeContentVersion());
        }
      });
    });
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
    // Wrapped in batch() so Map's synchronous layout computed (see map.js,
    // Solid migration Phase 8) never observes the intermediate state where
    // `child` is already in this.children but child.parent still points
    // elsewhere (or is null, via the removeChild() call below). Without
    // this, moving an item to a new parent momentarily has the item listed
    // as a child of the new parent while resolvedLayout/resolvedShape still
    // resolve through the old (or no) parent, throwing
    // "Non-connected item does not have layout".
    batch(() => {
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
      child.parent = this;
      this.children.splice(index, 0, child);
      this._bumpChildrenVersion();
    });
    // Foreign-object-in-SVG first-paint quirk (see map.js's show() for the
    // full explanation): a foreignObject just inserted into an already-
    // visible SVG can still measure shrunk on this pass, since the browser
    // has not painted it yet. Without this, a newly inserted node (e.g. via
    // Enter/Tab) can render collapsed onto its parent until some unrelated
    // relayout (like zooming) happens to fix it. Force one more recompute
    // after the browser paints, exactly like show() does for the initial
    // full-map insertion.
    const map = this.map;
    if (map?.isVisible) {
      // Force a remeasure of just this freshly inserted item (not the
      // whole map) to fix the foreign-object-in-SVG first-paint quirk
      // (see map.js's show() for the fuller explanation of the quirk
      // itself). Bumping the item's own content version keeps the
      // recompute scoped to this item and its ancestors, instead of
      // invalidating every item in the tree the way map.requestLayout()
      // used to (it shares one signal read by every item's layout memo).
      requestAnimationFrame(() => child._bumpContentVersion());
    }
  }
  removeChild(child) {
    batch(() => {
      var index = this.children.indexOf(child);
      this.children.splice(index, 1);
      this._bumpChildrenVersion();
      child.dom.node.remove();
      child.parent = null;
      !this.children.length && this.dom.toggle.remove();
    });
  }
  startEditing() {
    this.originalText = this.text;
    // dom.link is normally a trailing child of dom.text (see
    // updateText() below), appended inline after the label so it reads
    // as part of the text rather than overlapping it. Detach it before
    // enabling contentEditable so the user can't accidentally type
    // inside it, select it, or delete it as part of the edited text --
    // it's reattached in stopEditing() below.
    this.dom.link.remove();
    this.dom.text.contentEditable = "true";
    this.dom.text.focus();
    document.execCommand("styleWithCSS", false, "false");
    this.dom.text.addEventListener("input", this);
    this.dom.text.addEventListener("keydown", this);
    this.dom.text.addEventListener("blur", this);
    this.dom.text.addEventListener("paste", this);
  }
  stopEditing() {
    this.dom.text.removeEventListener("input", this);
    this.dom.text.removeEventListener("keydown", this);
    this.dom.text.removeEventListener("blur", this);
    this.dom.text.removeEventListener("paste", this);
    this.dom.text.blur();
    this.dom.text.contentEditable = "false";
    let result = this.dom.text.innerHTML;
    this.dom.text.innerHTML = this.originalText;
    // Reattach dom.link (removed in startEditing()) now that innerHTML
    // has been reset -- innerHTML assignment above wipes all children,
    // including any earlier append from updateText().
    this.dom.text.appendChild(this.dom.link);
    this.originalText = "";
    return result;
  }
  handleEvent(e) {
    switch (e.type) {
      case "input":
        this._bumpContentVersion();
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
      case "paste": {
        const pasted = e.clipboardData?.getData("text/plain") ?? "";
        if (!isUrlOnly(pasted)) {
          break;
        }
        const trimmed = pasted.trim();
        // Defer until the browser has actually inserted the pasted text,
        // so we can check whether it ended up being the item's *entire*
        // content (e.g. pasted into an empty node, or replacing a full
        // selection) -- see isUrlOnly()'s comment. Pasting a URL into
        // non-empty text should NOT set the url field.
        queueMicrotask(() => {
          if (this.dom.text.textContent.trim() === trimmed) {
            this.url = trimmed;
          }
        });
        break;
      }
    }
  }
  updateText() {
    // Always read the signal (even while editing) so this per-item effect
    // (see the constructor) stays subscribed to future changes. Returning
    // before this read while contentEditable is "true" would drop the
    // subscription, and the eventual "finish" commit (`_setText` in the
    // Finish command) would then never re-trigger this effect.
    const text = this._text();
    // While this item is being live-edited, the DOM is the source of
    // truth until "finish" commits it back to the `text` signal (see
    // command/edit.js's Finish command and stopEditing() below). Skipping
    // the DOM write here (but still reading the signal above) keeps
    // keystrokes and execCommand-based formatting like Bold from being
    // wiped by every reactive rerun that happens mid-edit.
    if (this.dom.text.contentEditable === "true") {
      return;
    }
    if (this.dom.text.innerHTML == text) {
      return;
    }
    this.dom.text.innerHTML = text;
    // innerHTML above wipes dom.text's children, including dom.link if it
    // was appended by a previous run -- reattach it as the trailing
    // element so the 🔗-replacement icon always reads as part of the
    // label's own text, not a separate item stuck elsewhere in the
    // layout.
    this.dom.text.appendChild(this.dom.link);
    // Text size can change the content box; this effect runs independently
    // of computeLayout() now, so it must nudge the layout memo itself to
    // remeasure this item (and its ancestors) rather than relying on
    // computeLayout() having read `_text()` directly.
    this._bumpContentVersion();
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
    // Icon presence/absence changes the content box (it's a flex sibling
    // of .text, see map.css); this effect runs independently of
    // computeLayout() now (see the constructor), so nudge the layout memo
    // itself to remeasure this item (and its ancestors).
    this._bumpContentVersion();
  }
  updateLink() {
    const url = this._url();
    this.dom.link.hidden = !url;
    // Same reasoning as updateIcon() above: the link icon sits inline at
    // the end of the text, so its presence/absence changes the content
    // box and must nudge the layout memo to remeasure.
    this._bumpContentVersion();
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
    this.dom.notes.hidden = !this._hasNotes();
    // Unlike updateText()/updateIcon() above, the notes badge is
    // absolutely positioned (see map.css's ".content .notes" rule) and
    // never affects the content box's measured size, so this
    // intentionally does NOT bump the content version -- doing so would
    // reintroduce a layout recompute that has no visible effect, exactly
    // the kind of unnecessary work docs/06.1-recursive-memo-layout-
    // refactor.md's Phase 7 is meant to remove.
  }
  // Bumps this item and every descendant's content version, forcing them
  // to remeasure on the next layout pull. Used when a collapsed ancestor
  // expands (see the `collapsed` setter above) -- see that comment for
  // why a plain synchronous remeasure at expand time is not sufficient.
  _bumpSubtreeContentVersion() {
    this._bumpContentVersion();
    this.children.forEach((child) => child._bumpSubtreeContentVersion());
  }
  updateToggle() {
    const { node, toggle } = this.dom;
    node.classList.toggle("collapsed", this._collapsed());
    toggle
      .querySelector("path")
      .setAttribute("d", this._collapsed() ? D_PLUS : D_MINUS);
  }

  // Only status/value remain here (see docs/06.1-recursive-memo-layout-
  // refactor.md, Phase 7): both read child-aggregated memos
  // (resolvedStatus/resolvedValue), so they must stay part of the
  // post-order layout pass. text/icon/notes/toggle moved to standalone
  // per-item effects (see the constructor) since they only touch this
  // item's own DOM and have no ordering dependency on children or parent.
  _updateLayoutContent() {
    this.updateStatus();
    this.updateValue();
  }

  // Content-affecting classes (data-shape/data-align drive map.css's
  // per-shape padding/border) must be applied *before* measuring this
  // item's content box in _measureOwnContent(). Previously these were
  // set inside _writeOwnLayout(), which runs *after* measurement --
  // so a shape change measured the box using the *old* shape's CSS
  // padding, then rendered it with the new shape's padding, producing
  // a shrunk/oversized look right after changing shape. Splitting the
  // style application out keeps measurement always working off
  // up-to-date CSS.
  // Only the CSS-affecting parts of styling happen here, before
  // measurement: data-shape/data-align drive map.css's per-shape
  // padding/border, which _measureOwnContent() must see already applied.
  // The actual shape *drawing* (resolvedShape.update()) is deferred to
  // _writeOwnLayout() below -- shapes like Underline draw a line based
  // on this item's measured contentSize/contentPosition, which do not
  // exist yet at this point.
  _applyOwnStyle() {
    const { resolvedShape, resolvedLayout, dom } = this;
    dom.text.style.color = this.resolvedTextColor;
    dom.node.dataset.shape = resolvedShape.id;
    dom.node.dataset.align = resolvedLayout.computeAlignment(this);
  }

  _measureOwnContent() {
    const { content } = this.dom;
    const size = [
      Math.max(content.offsetWidth, content.scrollWidth),
      Math.max(content.offsetHeight, content.scrollHeight),
    ];
    const fo = content.parentNode;
    fo.setAttribute("width", String(size[0]));
    fo.setAttribute("height", String(size[1]));
  }

  // Runs after measurement: positions children/connectors based on
  // already-measured sizes (this item's and its children's), and draws
  // this item's own shape (e.g. Underline's line), which also depends
  // on this item's now-accurate contentSize/contentPosition.
  _writeOwnLayout() {
    const { resolvedLayout, resolvedShape, dom } = this;
    dom.connectors.innerHTML = "";
    resolvedLayout.update(this);
    resolvedShape.update(this);
  }
}
// Matches a string that is *entirely* a URL (nothing else). Used only to
// detect "the pasted clipboard text was a URL and nothing else" (see
// handleEvent()'s "paste" case above) -- distinct from the old
// findLinks()-based in-place linkification this replaces, which turned a
// URL substring inside otherwise plain text into a clickable <a>. That
// in-place linkification is gone; a URL is now only ever associated with
// an item via the explicit `url` field (see the 🔗 icon/updateLink()).
const URL_ONLY_RE = /^https?:\/\/\S+$/i;
function isUrlOnly(str) {
  return URL_ONLY_RE.test(str.trim());
}
// Whether `url` resolves to the same origin as the current page. Used by
// the link-open click handler above to decide SPA-navigate-in-place vs
// new-tab. Falls back to false (treat as external) for anything that
// fails to parse as a URL, so a malformed value never throws.
function isSameOrigin(url) {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
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
// Notes indicator icon (lucide "paperclip"), built the same way as
// buildToggle() above instead of being loaded via a CSS background-image
// (see map.css's old ".item .notes" rule). Same viewBox/attributes as
// lucide-solid's Paperclip icon, so it renders identically and now
// inherits color via currentColor like every other inline icon here.
function buildNotesIcon() {
  let s = svg.node("svg", {
    viewBox: "0 0 512 512",
    fill: "none",
  });

  s.append(
    svg.node("path", {
      d: "M359.784,103.784v262.919c0,57.226-46.557,103.784-103.784,103.784s-103.784-46.557-103.784-103.784V103.784c0-34.336,27.934-62.27,62.27-62.27c34.336,0,62.27,27.934,62.27,62.27v262.919c0,11.445-9.312,20.757-20.757,20.757s-20.757-9.311-20.757-20.757V103.784H193.73v262.919c0,34.336,27.934,62.27,62.27,62.27s62.27-27.934,62.27-62.27V103.784C318.27,46.557,271.713,0,214.487,0S110.703,46.557,110.703,103.784v262.919C110.703,446.82,175.883,512,256,512s145.297-65.18,145.297-145.297V103.784H359.784z",
      fill: "#000000",
    }),
  );

  return s;
}
// Link-open icon (lucide "link-2"), built the same way as
// buildNotesIcon() above -- same viewBox/attributes as lucide-solid's
// Link2 icon, so it renders identically and inherits color via
// currentColor like every other inline icon here. Replaces the earlier
// 🔗 emoji glyph, which rendered inconsistently across platforms/fonts.
function buildLinkIcon() {
  let s = svg.node("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#000000",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });

  s.append(
    svg.node("path", {
      d: "M9 17H7A5 5 0 0 1 7 7h2",
    }),
    svg.node("path", {
      d: "M15 7h2a5 5 0 1 1 0 10h-2",
    }),
    svg.node("line", {
      x1: "8",
      x2: "16",
      y1: "12",
      y2: "12",
    }),
  );

  return s;
}
const COLOR = "#999";

function computeLayout(item) {
  if (!item.dom) {
    return [0, 0];
  }
  // Detached items can briefly have a stale/dirty layout memo during JSON
  // restore or reparenting, before their parent signal has been connected.
  // They do not have enough context for inherited layout, root alignment, or
  // MapLayout side assignment, so keep the memo harmless until the item is
  // attached and a parent/root recompute pulls it again.
  const parent = item.parent;
  const map = item.map;
  if (!parent || (parent && !map)) {
    return item.size;
  }
  item._sideVersion();
  item._contentVersion();
  map?._layoutVersion?.();
  if (!item._resolvedLayout()) {
    return item.size;
  }
  item._updateLayoutContent();
  item._applyOwnStyle();
  if (!item._collapsed()) {
    item._childrenVersion();
    item.children.forEach(readItemLayoutResult);
  }
  item._measureOwnContent();
  item._writeOwnLayout();
  return item.size;
}
