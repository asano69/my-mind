// src/map.js
import Item from "./item.js";
import { repo as layoutRepo } from "./layout/layout.js";
import { br2nl } from "./format/format.js";
import * as svg from "./svg.js";
import * as html from "./html.js";
import * as app from "./my-mind.js";
import { bumpDirty } from "./store.js";
import { createSignal, createComputed, createRoot } from "solid-js";
let css = "";

// Recomputes DOM content sync + layout + connectors for `item` and its
// whole subtree, depth-first (children before parent — a parent's own
// rank size depends on its children's already-measured content boxes,
// same order the old Item.prototype.update({children:true}) recursion
// used). This is the single place layout recomputation happens now (see
// CLAUDE.md, Solid migration Phase 8); it's invoked from the reactive
// computed set up in Map's constructor below.
function layoutSubtree(item) {
  item._childrenVersion(); // track child insertion/removal
  item.children.forEach(layoutSubtree);
  item.updateText();
  item.updateStatus();
  item.updateValue();
  item.updateIcon();
  item.updateNotes();
  item.updateToggle();
  const { resolvedLayout, resolvedShape, dom } = item;
  const { content, node, connectors } = dom;
  dom.text.style.color = item.resolvedTextColor;
  node.dataset.shape = resolvedShape.id; // applies css => modifies dimensions (necessary for layout)
  node.dataset.align = resolvedLayout.computeAlignment(item); // applies css => modifies dimensions (necessary for layout)
  const fo = content.parentNode;
  const size = [
    Math.max(content.offsetWidth, content.scrollWidth),
    Math.max(content.offsetHeight, content.scrollHeight),
  ];
  fo.setAttribute("width", String(size[0]));
  fo.setAttribute("height", String(size[1]));
  connectors.innerHTML = "";
  resolvedLayout.update(item);
  resolvedShape.update(item); // needs layout -> draws second
}

export default class Map {
  constructor(options) {
    this.node = svg.node("svg");
    this.style = html.node("style");
    this.position = [0, 0];
    this.fontSize = 15;
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
    this.style.textContent = css;
    this.node.style.fontSize = `${this.fontSize}px`;
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
    this._setLayoutVersion = setLayoutVersion;
    createRoot((dispose) => {
      this._disposeLayout = dispose;
      createComputed(() => {
        layoutVersion();
        if (!this.isVisible) {
          return;
        }
        layoutSubtree(this._root);
        this.node.setAttribute("width", String(this._root.size[0]));
        this.node.setAttribute("height", String(this._root.size[1]));
        // Bump once per full pass, not once per item — layoutSubtree
        // walks the whole tree on every recompute (known cost from
        // Phase 8), but auto-save only needs "did anything change",
        // never "how many items changed" (see CLAUDE.md, Solid
        // migration Phase 9.5 — an intentional coarsening, not a
        // strict 1:1 port of the old per-item publish).
        bumpDirty();
      });
    });
  }

  // Forces the layout computed above to re-run even when no item signal
  // changed. Needed for the handful of triggers outside the reactive
  // system: item.side (deliberately non-reactive, see item.js's mergeWith
  // comment), live contentEditable typing (item.js's handleEvent), and
  // pure CSS font-size changes (adjustFontSize below).
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
  adjustFontSize(diff) {
    this.fontSize = Math.max(8, this.fontSize + 2 * diff);
    this.node.style.fontSize = `${this.fontSize}px`;
    this.requestLayout();
    this.ensureItemVisibility(app.currentItem);
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
    return br2nl(name).replace(/\n/g, " ").replace(/<.*?>/g, "").trim();
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
export async function init() {
  // Skip the fetch on every remount: css is a module-level cache that
  // survives across mount/unmount cycles (map.css never changes at
  // runtime), so only the very first mount needs to fetch it.
  if (css) {
    return;
  }
  let response = await fetch("/map.css");
  css = await response.text();
}
