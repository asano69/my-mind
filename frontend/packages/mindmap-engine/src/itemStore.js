// itemStore.js — plain, DOM-free reactive tree data model.
//
// Phase 1 of docs/08-mindmap-engine-refactor.md: splits the "data" half
// of the current item.js Item class out from its "DOM ownership" half.
// A node created here holds signal-backed properties and computed
// (memo) inheritance/aggregation getters, but never touches an SVG or
// HTML element -- nothing in this file imports html.js/svg.js. item.js
// still owns rendering until a later phase replaces it with JSX (see
// doc08's Phase 2 onward); NewMindMapPreview.jsx (behind the
// ?newEngine=1 flag) is the first real consumer.
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
//
// Phase 3.5 (see docs/08-mindmap-engine-refactor.md) adds layoutResult:
// a per-item recursive layout memo mirroring item.js's own proven
// _layoutResult (docs/06.1-recursive-memo-layout-refactor.md). A parent
// reads a child's layoutResult() directly from inside its own
// computation, so post-order evaluation is guaranteed by plain
// synchronous function calls, not by Solid's scheduler or by JSX mount
// order. This replaces the plain recursive computePreviewTreeLayout()
// function NewMindMapPreview.jsx used to own -- that approach recomputed
// the whole visible tree from scratch on every change (see doc08's
// Phase 3.4 post-mortem), while this memo only recomputes the changed
// item and its ancestors.
//
// Hard rule enforced throughout this file: layoutResult's computation
// (_computeLayout() below) must only READ signals and write plain
// (non-reactive) fields -- it must never call a signal setter or touch
// the DOM. Writing a signal from inside a memo's own computation is
// exactly what caused doc08's Phase 3.4 recursion crash. The one signal
// this file exposes for layout purposes (_measuredSize, written via
// setMeasuredSize()) is only ever meant to be called from a component's
// createEffect, strictly after the DOM has actually been committed.
import { createSignal, createMemo, createRoot, batch } from "solid-js";
import { repo as shapeRepo } from "./shape/shape.js";
import { repo as layoutRepo } from "./layout/layout.js";
import { computeGraphLayout } from "./layout/graph.js";
import TreeLayout, { computeTreeLayout } from "./layout/tree.js";
import MapLayout, { computeMapLayout } from "./layout/map.js";
import { br2nl } from "./format/format.js";

const DEFAULT_COLOR = "#999";
// Placeholder content-box sizes used until an item's real DOM has been
// measured at least once (see setMeasuredSize()/_computeLayout()
// below). Root renders with a larger font-size (see map.css), hence
// the bigger default -- these replace the ROOT_CONTENT_SIZE/
// CHILD_CONTENT_SIZE constants NewMindMapPreview.jsx used to own
// before layoutResult moved the measurement bookkeeping into the store.
const DEFAULT_ROOT_CONTENT_SIZE = [220, 72];
const DEFAULT_CHILD_CONTENT_SIZE = [150, 44];

function generateId() {
  let str = "";
  for (let i = 0; i < 8; i++) {
    const code = Math.floor(Math.random() * 26);
    str += String.fromCharCode("a".charCodeAt(0) + code);
  }
  return str;
}

// Reads an element's rendered content-box size, falling back to
// `fallbackSize` if the element hasn't produced any measurable size yet
// (e.g. not yet painted). Shared by ItemNodeView's post-render
// measurement effect (see NewMindMapPreview.jsx, which re-exports this)
// and newEdit.js's post-commit remeasure (Phase 4.5 of
// docs/08-mindmap-engine-refactor.md).
export function measureContentSize(element, fallbackSize) {
  if (!element) {
    return fallbackSize;
  }
  const width = Math.ceil(
    Math.max(element.offsetWidth || 0, element.scrollWidth || 0),
  );
  const height = Math.ceil(
    Math.max(element.offsetHeight || 0, element.scrollHeight || 0),
  );
  return [width || fallbackSize[0], height || fallbackSize[1]];
}

// Dispatches to the correct pure layout computation for the item's
// actual resolved layout kind, mirroring the polymorphism item.js's
// resolvedLayout.update(item) relies on (MapLayout/GraphLayout/
// TreeLayout each lay out children differently). Without this dispatch,
// every item's layout was computed via computeMapLayout()'s non-root
// branch regardless of what layout was actually selected -- harmless
// for an explicit Graph layout (whose own getChildDirection happens to
// resolve back to the same graph-{side} instance) but silently wrong
// for an explicit Tree layout, which never ran TreeLayout's own
// algorithm at all.
function computeLayoutSnapshot(layout, item) {
  if (layout instanceof MapLayout) {
    return computeMapLayout(layout, item);
  }
  if (layout instanceof TreeLayout) {
    return computeTreeLayout(layout, item, layout.childDirection);
  }
  return computeGraphLayout(layout, item, layout.childDirection);
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

    // A real signal, like every other item-store property -- no
    // dedicated version counter needed. Layout code (e.g.
    // MapLayout.getChildDirection) reads `child.side` from inside a
    // parent's _computeLayout(), so a side change is tracked as a
    // normal dependency of that memo, the same way text/color/etc. are.
    const [side, setSide] = createSignal(null);
    this._side = side;
    this._setSide = setSide;

    const [childrenVersion, setChildrenVersion] = createSignal(0);
    this._childrenVersion = childrenVersion;
    this._bumpChildrenVersion = () => setChildrenVersion((v) => v + 1);

    const [shape, setShape] = createSignal(null);
    this._shape = shape;
    this._setShape = setShape;

    const [layout, setLayout] = createSignal(null);
    this._layout = layout;
    this._setLayout = setLayout;

    // Resolved values (resolvedColor/resolvedTextColor/resolvedShape/
    // resolvedLayout/resolvedValue/resolvedStatus) are computed in
    // getters below instead of cached in createMemo(). The preview tree
    // is populated from saved JSON after construction, and these
    // accessors must always reflect those post-load writes before the
    // first JSX layout/render pass.

    // Measured size of this item's own rendered content box, written
    // only from a component's createEffect once it has actually
    // mounted (see NewMindMapPreview.jsx's ItemNodeView) -- never from
    // inside layoutResult's own computation. null until the first real
    // measurement, so _computeLayout() below falls back to a
    // placeholder size instead of collapsing to 0x0 on the first pass.
    const [measuredSize, setMeasuredSize] = createSignal(null);
    this._measuredSize = measuredSize;
    // Wrapped so an unchanged measurement (the common case once a node
    // has stabilized) is a no-op rather than writing a fresh array
    // reference every time -- a plain createSignal setter would
    // otherwise invalidate layoutResult (and every ancestor's) on every
    // resize-observer-style tick even when nothing actually changed.

    // imperative setter on a data-model class, not a Solid component;
    // the signal read below is a one-off equality check against the
    // value at call time, not something that needs to re-run when
    // measuredSize() changes.
    this.setMeasuredSize = (size) => {
      const current = measuredSize();
      if (current && current[0] === size[0] && current[1] === size[1]) {
        return;
      }
      setMeasuredSize(size);
    };

    // contentSize/contentPosition/position/size are plain (non-signal)
    // fields written by the pure layout functions in layout/*.js
    // (computeMapLayout()/computeGraphLayout(), see
    // docs/08-mindmap-engine-refactor.md's Phase 3.1-3.3 progress
    // notes) as a side effect of _computeLayout() below. They are left
    // undefined until layoutResult() is first pulled for this item --
    // an item hidden behind a collapsed ancestor is never pulled, so
    // its fields deliberately stay undefined rather than defaulting to
    // some placeholder, mirroring item.js's own "detached/never-laid-
    // out item" behavior. Anything outside the post-order pass (e.g.
    // JSX) that reads them must first read layoutResult() itself in the
    // same tracked scope, or it will not notice when these plain fields
    // change -- see NewMindMapPreview.jsx's ItemNodeView for the pattern.

    // Per-item recursive layout memo (see this file's header comment
    // and docs/08-mindmap-engine-refactor.md's Phase 3.4/3.5). Wrapped
    // in its own createRoot for the same reason item.js's own memos
    // are (see that file's constructor comment): a memo created outside
    // a component tree needs an explicit owner or Solid warns it will
    // never be disposed.
    createRoot((dispose) => {
      this._disposeLayoutMemo = dispose;
      // Memoized the same way item.js's own resolvedColor/
      // resolvedTextColor are (see that file's constructor): without
      // this, resolvedColor/resolvedTextColor were plain getters that
      // re-walked the whole ancestor chain on every read, so any
      // computation reading them (including layoutResult itself)
      // subscribed directly to every ancestor's raw color signal. A
      // subtree with its own explicit color now stops that
      // subscription at its own boundary instead of propagating all
      // the way to the root.
      this._resolvedColor = createMemo(() => {
        const own = this._color();
        if (own && own !== "#ffffff") {
          return own;
        }
        const parent = this.parent;
        return parent instanceof ItemNode
          ? parent.resolvedColor
          : DEFAULT_COLOR;
      });
      this._resolvedTextColor = createMemo(() => {
        const own = this._textColor();
        if (own && own !== "#ffffff") {
          return own;
        }
        const parent = this.parent;
        return parent instanceof ItemNode ? parent.resolvedTextColor : "";
      });
      this.layoutResult = createMemo(() => this._computeLayout());
    });
  }

  // Resolves the layout algorithm used to compute this item's own
  // position/connectors. Unlike the public resolvedLayout getter below,
  // this never throws for a disconnected item -- it falls back to the
  // "map" layout instead, so a node whose ancestor hasn't had its
  // layout signal set yet doesn't crash layoutResult(). Mirrors the
  // fallback NewMindMapPreview.jsx's old previewLayoutFor() used before
  // this memo moved into the store itself.
  _layoutForCompute() {
    let node = this;
    while (node) {
      if (node._layout()) {
        return node._layout();
      }
      node = node.parent;
    }
    return layoutRepo.get("map");
  }

  // Placeholder content-box size used until setMeasuredSize() has been
  // called at least once for this item (see the constructor's comment
  // on _measuredSize above). Public (no underscore) since components
  // read this directly to size a first-paint foreignObject before any
  // real measurement exists.
  defaultContentSize() {
    return this.isRoot ? DEFAULT_ROOT_CONTENT_SIZE : DEFAULT_CHILD_CONTENT_SIZE;
  }

  // Pure computation: reads signals (this item's own, and -- via the
  // recursive layoutResult() calls below -- every visible descendant's
  // too), writes only plain (non-reactive) fields on this and
  // descendant items, and returns a layout snapshot. Must never call a
  // signal setter or touch the DOM -- see this file's header comment.
  _computeLayout() {
    this.contentSize = this._measuredSize() ?? this.defaultContentSize();

    // Post-order: pull every visible child's layoutResult() first, so
    // each child's `.size` (written inside its own _computeLayout()) is
    // already set by the time computeMapLayout() below reads it via
    // computeChildrenBBox(). Collapsed items are excluded here exactly
    // like item.js's own `!item.collapsed` guard -- their subtree's
    // layoutResult is never pulled while collapsed, so it never
    // recomputes on an unrelated change while hidden.
    const childLayouts = this.collapsed
      ? []
      : this.childItems.map((child) => child.layoutResult());

    const result = computeLayoutSnapshot(this._layoutForCompute(), this);
    // layoutRoot() reports {width, height} directly; the non-root graph
    // layout path only reports totalHeight (see layout/graph.js) and
    // leaves size to be derived from contentPosition/contentSize and
    // children's own positions -- same fallback
    // NewMindMapPreview.jsx's old computedSizeFor() used.
    this.size = [
      result.width ?? this._fallbackComputedWidth(),
      result.height ?? this._fallbackComputedHeight(),
    ];

    return {
      item: this,
      childLayouts,
      connectorPaths: result.connectorPaths,
      size: this.size,
    };
  }

  _fallbackComputedWidth() {
    let width = this.contentPosition[0] + this.contentSize[0];
    if (!this.collapsed) {
      for (const child of this.childItems) {
        width = Math.max(width, (child.position?.[0] ?? 0) + child.size[0]);
      }
    }
    return width;
  }

  _fallbackComputedHeight() {
    let height = this.contentPosition[1] + this.contentSize[1];
    if (!this.collapsed) {
      for (const child of this.childItems) {
        height = Math.max(height, (child.position?.[1] ?? 0) + child.size[1]);
      }
    }
    return height;
  }

  get id() {
    return this._id;
  }

  // Mirrors map.js's Map.prototype.name: the map's display name derived
  // from the root's own text, used as the auto title (see newIo.js's
  // adapt() and NewMindMapPreview.jsx's title-sync effect).
  get name() {
    return br2nl(this.text)
      .replace(/\n/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\u00a0/g, " ")
      .replace(/[<>]/g, "")
      .trim();
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

  get childItems() {
    this._childrenVersion();
    return this.children;
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
    const value = this._value();
    if (typeof value == "number") {
      return value;
    }
    const childValues = this.childItems.map((child) => child.resolvedValue);
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
  }

  get status() {
    return this._status();
  }
  set status(status) {
    this._setStatus(status);
  }
  get resolvedStatus() {
    const status = this._status();
    if (status == "computed") {
      return this.childItems.every((child) => child.resolvedStatus !== false);
    }
    return status;
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
    return this._side();
  }
  set side(side) {
    this._setSide(side);
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
    const own = this._layout();
    if (own) {
      return own;
    }
    const parent = this.parent;
    const layout = parent instanceof ItemNode ? parent.resolvedLayout : null;
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
    const shape = this._shape();
    if (shape) {
      return shape;
    }
    switch (this.depth) {
      case 0:
        return shapeRepo.get("ellipse");
      case 1:
        return shapeRepo.get("box");
      default:
        return shapeRepo.get("underline");
    }
  }

  get depth() {
    let depth = 0;
    let node = this;
    while (node.parent instanceof ItemNode) {
      depth++;
      node = node.parent;
    }
    return depth;
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
    if (this._side()) {
      data.side = this._side();
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
   * Only when creating a new item.
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
      this._setSide(data.side);
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
