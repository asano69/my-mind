// src/map.js
import Item, { readItemLayoutResult } from "./item.js";
import { repo as layoutRepo } from "./layout/layout.js";
import * as svg from "./svg.js";
import * as html from "./html.js";
import * as app from "./my-mind.js";
import { bumpDirty, titleAuto, setCurrentTitle } from "./store.js";
import { br2nl } from "./format/format.js";
import { createSignal, createComputed, createRoot } from "solid-js";
// Raw-text import: Vite reads and inlines map.css's content at build
// time instead of the old fetch("/map.css") runtime request against a
// public/ static file -- no network round-trip, no async init() needed.
// Still injected as an inline <style> element (see the constructor
// below), not linked as a normal stylesheet, because the same text must
// also be embedded inside exported/serialized SVG snapshots (see
// backend/image.js's serializeCurrentMap) so they render correctly
// standalone, with no access to the app's own page stylesheet.
import mapCss from "./map.css?raw";
const DEFAULT_FONT_SIZE = 15;
const MIN_ZOOM_SCALE = 8 / DEFAULT_FONT_SIZE;
const ZOOM_STEP = 2 / DEFAULT_FONT_SIZE;

export default class Map {
  constructor(options) {
    this.node = svg.node("svg");
    this.style = html.node("style");
    this.position = [0, 0];
    this.zoomScale = 1;
    let resolvedOptions = Object.assign(
      {
        root: (() => {
          const d = new Date();
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");

          return `${yyyy}-${mm}-${dd}`;
        })(),
        layout: layoutRepo.get("map"),
      },
      options,
    );
    this.style.textContent = mapCss;
    this.node.style.fontSize = `${DEFAULT_FONT_SIZE}px`;
    this.node.style.transformOrigin = "0 0";
    let root = new Item();
    root.text = resolvedOptions.root;
    root.layout = resolvedOptions.layout;
    this.root = root;

    // Single reactive layout pass for the whole map (see CLAUDE.md, Solid
    // migration Phase 8). createComputed — not createEffect — so both the
    // first run and every re-run happen synchronously: show()/center() and
    // other direct callers need the DOM already reflecting the latest
    // layout the instant they resume execution, not on a deferred tick.
    const [layoutVersion, setLayoutVersion] = createSignal(0);
    this._layoutVersion = layoutVersion;
    this._setLayoutVersion = setLayoutVersion;
    // Root's own on-screen anchor across layout passes (see the moveBy()
    // call below). Stays null until the first real layout pass has run,
    // so that first pass never triggers a compensating move.
    this._lastRootContentPosition = null;
    createRoot((dispose) => {
      this._disposeLayout = dispose;
      createComputed(() => {
        layoutVersion();
        if (!this.isVisible) {
          return;
        }
        const rootSize = readItemLayoutResult(this._root);
        this.node.setAttribute("width", String(rootSize[0]));
        this.node.setAttribute("height", String(rootSize[1]));
        this._anchorRootPosition(this._root.contentPosition);
        // Keeps the map's title synced to the root node's label whenever
        // titleAuto is on (see store.js/ui/io.js). Piggybacks on this
        // already-existing layout pass rather than a dedicated effect: a
        // root text edit invalidates root's own layout memo, which this
        // computed reads via readItemLayoutResult() above, so this
        // reruns synchronously on every root text change -- no new
        // signal needed.
        if (titleAuto()) {
          setCurrentTitle(this.name);
        }
        // Bump once per root layout pull, not once per item: auto-save only
        // needs "did anything change", never "how many items changed".
        bumpDirty();
      });
    });
  }

  // Keeps the root node visually anchored to the same screen point across
  // layout recomputes. layoutRoot() (see layout/map.js) repositions root's
  // own contentPosition whenever the left/right children's bounding boxes
  // change size (e.g. after a collapse, a drag-and-drop move, or a text
  // edit), which otherwise shifts the *whole* map on screen even though
  // only the affected branch actually changed. Compensates by moving the
  // map's own screen position by the opposite delta, so only the branches
  // appear to move. This is the single anchoring codepath used by every
  // layout-triggering operation (collapse, move, edit, and show()'s own
  // paint-quirk correction below) -- there is no separate per-operation
  // positioning logic.
  _anchorRootPosition(rootContentPosition) {
    if (this._lastRootContentPosition) {
      const dx = rootContentPosition[0] - this._lastRootContentPosition[0];
      const dy = rootContentPosition[1] - this._lastRootContentPosition[1];
      if (dx || dy) {
        // contentPosition lives inside the node that carries the zoom
        // `transform: scale()`, while moveBy()'s left/top offsets sit
        // outside that transform (see adjustZoom()'s own anchor math), so
        // the compensation must be scaled by zoomScale to line up on
        // screen.
        this.moveBy([-dx * this.zoomScale, -dy * this.zoomScale]);
      }
    }
    this._lastRootContentPosition = rootContentPosition;
  }

  // Forces the root layout memo to be read again when no item-level signal
  // changed. Most formerly non-reactive triggers now use narrower item/map
  // versions; this remains for full-map visibility/paint repair passes.
  requestLayout() {
    this._setLayoutVersion((v) => v + 1);
  }

  static fromJSON(data) {
    return new this().fromJSON(data);
  }
  toJSON() {
    let data = {
      root: this._root.toJSON(),
    };
    return data;
  }
  fromJSON(data) {
    this.root = Item.fromJSON(data.root);
    return this;
  }
  get root() {
    return this._root;
  }
  set root(root) {
    const { node, style } = this;
    this._root = root;
    node.innerHTML = "";
    node.append(root.dom.node, style);
    root.parent = this;
  }
  adjustZoom(diff, anchorPoint = null) {
    const previousScale = this.zoomScale;
    const nextScale = Math.max(
      MIN_ZOOM_SCALE,
      previousScale + ZOOM_STEP * diff,
    );
    if (nextScale === previousScale) {
      return;
    }

    if (!anchorPoint) {
      const anchorItem = app.currentItem || this._root;
      const rect = anchorItem.dom.content.getBoundingClientRect();
      anchorPoint = [rect.left + rect.width / 2, rect.top + rect.height / 2];
    }

    const before = this.node.getBoundingClientRect();
    const unscaledAnchorOffset = [
      (anchorPoint[0] - before.left) / previousScale,
      (anchorPoint[1] - before.top) / previousScale,
    ];

    this.zoomScale = nextScale;
    this.node.style.transform = `scale(${this.zoomScale})`;

    const after = this.node.getBoundingClientRect();
    this.moveBy([
      anchorPoint[0] - (after.left + unscaledAnchorOffset[0] * nextScale),
      anchorPoint[1] - (after.top + unscaledAnchorOffset[1] * nextScale),
    ]);
  }

  mergeWith(data) {
    // store a sequence of nodes to be selected when merge is over
    let ids = [];
    var current = app.currentItem;
    var node = current;
    while (true) {
      ids.push(node.id);
      if (node.parent == this) {
        break;
      }
      node = node.parent;
    }
    this._root.mergeWith(data.root);
    if (current.map) {
      /* selected node still in tree, cool */
      /* if one of the parents got collapsed, act as if the node got removed */
      let node = current;
      let hidden = false;
      while (true) {
        if (node.parent == this) {
          break;
        }
        node = node.parent;
        if (node.collapsed) {
          hidden = true;
        }
      }
      if (!hidden) {
        return;
      } /* nothing bad happened, continue */
    }
    /* previously selected node is no longer in the tree OR it is folded */
    /* what if the node was being edited? */
    app.editing && app.stopEditing();
    /* get all items by their id */
    var idMap = {};
    var scan = function (item) {
      idMap[item.id] = item;
      item.children.forEach(scan);
    };
    scan(this._root);
    /* select the nearest existing parent */
    while (ids.length) {
      var id = ids.shift();
      if (id in idMap) {
        app.selectItem(idMap[id]);
        return;
      }
    }
  }
  get isVisible() {
    return !!this.node.parentNode;
  }
  show(where) {
    where.append(this.node);
    this.requestLayout();
    this.center();
    app.selectItem(this._root);
    // Foreign-object-in-SVG first-paint quirk: right after inserting a
    // brand-new SVG (with all its foreignObject/HTML content) into the
    // document, the very first offsetWidth/scrollWidth reads inside the
    // layout memo can be measured before the browser's first real paint,
    // collapsing the SVG's own width/height attributes to ~0 (the map
    // looks empty) until some later relayout (e.g. zooming, or inserting
    // a node) recomputes real sizes. A single rAF is not always enough to
    // guarantee paint has actually committed by the time the callback
    // runs -- see toast.js's showToast() for the same lesson learned, and
    // this is especially visible for a brand-new map with no prior
    // content to have already forced a layout pass. Double-rAF for the
    // same reason toast.js needs it.
    // Foreign-object-in-SVG first-paint quirk (see item.js's insertChild(),
    // which already works around the exact same issue for newly inserted
    // children by bumping that item's own contentVersion one rAF later).
    // The root never goes through insertChild(), so on a brand-new map
    // (root only, no children yet) nothing ever applied that fix to the
    // root itself — its foreignObject could stay stuck at a stale zero
    // size until some later, unrelated DOM mutation (e.g. inserting the
    // first child) happened to force a real remeasure. Apply the same
    // targeted fix to the root here instead of relying only on
    // requestLayout(), which re-triggers the same computation but does
    // not by itself guarantee the browser has actually repainted.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Do NOT call center() again here. Bumping the content version
        // re-triggers the shared layout computed above, whose
        // _anchorRootPosition() call already keeps the map at the exact
        // screen position center() placed it at just above -- the same
        // anchoring a collapse or a drag-and-drop move relies on. A
        // second explicit center() call here used to override that
        // anchored position with a fresh center calculation based on the
        // now-accurate (post-paint) root size, which is why a reload's
        // final position could end up different from where a collapse
        // mid-session would have left the map.
        this._root._bumpContentVersion();
      });
    });
  }
  hide() {
    this.node.remove();
  }
  center() {
    let { size } = this._root;
    let parent = this.node.parentNode;
    let position = [
      (parent.offsetWidth - size[0]) / 2,
      (parent.offsetHeight - size[1]) / 2,
    ].map(Math.round);
    this.moveTo(position);
  }
  moveBy(diff) {
    let position = this.position.map((p, i) => p + diff[i]);
    return this.moveTo(position);
  }
  getClosestItem(point) {
    let all = [];
    function scan(item) {
      let rect = item.dom.content.getBoundingClientRect();
      let dx = rect.left + rect.width / 2 - point[0];
      let dy = rect.top + rect.height / 2 - point[1];
      let distance = dx * dx + dy * dy;
      all.push({ dx, dy, item, distance });
      if (!item.collapsed) {
        item.children.forEach(scan);
      }
    }
    scan(this._root);
    all.sort((a, b) => a.distance - b.distance);
    return all[0];
  }
  getItemFor(node) {
    let content = node.closest(".content");
    if (!content) {
      return;
    }
    function scanForContent(item) {
      if (item.dom.content == content) {
        return item;
      }
      for (let child of item.children) {
        let found = scanForContent(child);
        if (found) {
          return found;
        }
      }
    }
    return scanForContent(this._root);
  }
  ensureItemVisibility(item) {
    // An item hidden by a collapsed ancestor (e.g. just dropped into a
    // collapsed node) is display:none, and getBoundingClientRect() on a
    // display:none element returns an all-zero rect. Without this guard,
    // that all-zero rect looks like "far off-screen at (0,0)" and
    // triggers a large, spurious moveBy() that visibly shifts the whole
    // map the instant the drop happens. getClientRects() returning
    // nothing is the standard way to detect display:none.
    if (item.dom.content.getClientRects().length === 0) {
      return;
    }
    const padding = 10;
    let itemRect = item.dom.content.getBoundingClientRect();
    var parentRect = this.node.parentNode.getBoundingClientRect();
    var delta = [0, 0];
    var dx = parentRect.left - itemRect.left + padding;
    if (dx > 0) {
      delta[0] = dx;
    }
    var dx = parentRect.right - itemRect.right - padding;
    if (dx < 0) {
      delta[0] = dx;
    }
    var dy = parentRect.top - itemRect.top + padding;
    if (dy > 0) {
      delta[1] = dy;
    }
    var dy = parentRect.bottom - itemRect.bottom - padding;
    if (dy < 0) {
      delta[1] = dy;
    }
    if (delta[0] || delta[1]) {
      this.moveBy(delta);
    }
  }
  get name() {
    let name = this._root.text;
    return br2nl(name).replace(/\n/g, " ").replace(/[<>]/g, "").trim();
  }
  get id() {
    return this._root.id;
  }
  pick(item, direction) {
    let candidates = [];
    var currentRect = item.dom.content.getBoundingClientRect();
    this.getPickCandidates(currentRect, this._root, direction, candidates);
    if (!candidates.length) {
      return item;
    }
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0].item;
  }
  getPickCandidates(currentRect, item, direction, candidates) {
    if (!item.collapsed) {
      item.children.forEach((child) => {
        this.getPickCandidates(currentRect, child, direction, candidates);
      });
    }
    var node = item.dom.content;
    var rect = node.getBoundingClientRect();
    if (direction == "left" || direction == "right") {
      var x1 = currentRect.left + currentRect.width / 2;
      var x2 = rect.left + rect.width / 2;
      if (direction == "left" && x2 > x1) {
        return;
      }
      if (direction == "right" && x2 < x1) {
        return;
      }
      var diff1 = currentRect.top - rect.bottom;
      var diff2 = rect.top - currentRect.bottom;
      var dist = Math.abs(x2 - x1);
    } else {
      var y1 = currentRect.top + currentRect.height / 2;
      var y2 = rect.top + rect.height / 2;
      if (direction == "top" && y2 > y1) {
        return;
      }
      if (direction == "bottom" && y2 < y1) {
        return;
      }
      var diff1 = currentRect.left - rect.right;
      var diff2 = rect.left - currentRect.right;
      var dist = Math.abs(y2 - y1);
    }
    var diff = Math.max(diff1, diff2);
    if (diff > 0) {
      return;
    }
    if (!dist || dist < diff) {
      return;
    }
    candidates.push({ item: item, dist: dist });
  }
  moveTo(point) {
    this.position = point;
    this.node.style.left = `${point[0]}px`;
    this.node.style.top = `${point[1]}px`;
  }
}
