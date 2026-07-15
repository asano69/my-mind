// src/map.ts
import Item from "./item.js";
import { repo as layoutRepo } from "./layout/layout.js";
import { br2nl } from "./format/format.js";
import * as svg from "./svg.js";
import * as html from "./html.js";
import * as app from "./my-mind.js";
let css = "";
const UPDATE_OPTIONS = {
  children: true,
};
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
          const yy = String(d.getFullYear()).slice(-2);
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          const hh = String(d.getHours()).padStart(2, "0");
          const mi = String(d.getMinutes()).padStart(2, "0");
          return `${yy}${mm}${dd}`;
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
    this.update();
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
  update(options) {
    options = Object.assign({}, UPDATE_OPTIONS, options);
    options.children && this._root.update({ parent: false, children: true });
    const { node } = this;
    const { size } = this._root;
    node.setAttribute("width", String(size[0]));
    node.setAttribute("height", String(size[1]));
  }
  show(where) {
    where.append(this.node);
    this.update();
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
  let response = await fetch("map.css");
  css = await response.text();
}
