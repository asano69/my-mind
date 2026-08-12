import { describe, it, expect } from "vitest";

// Phase 3.5 (see docs/08-mindmap-engine-refactor.md): locality
// regression test for ItemNode.layoutResult, the store-owned recursive
// memo that replaced the plain recursive computePreviewTreeLayout()
// function NewMindMapPreview.jsx used to own. Mirrors
// layout-measurement.test.js's spy-and-count pattern (itself based on
// item.test.js's instrumentLayout()), but spies on _computeLayout()
// calls, since this store folds the old engine's separate
// _updateLayoutContent()/_measureOwnContent()/_writeOwnLayout() steps
// into one method.
import "./shape/box.js";
import "./shape/ellipse.js";
import "./shape/underline.js";
import "./layout/graph.js";
import "./layout/tree.js";
import "./layout/map.js";

import ItemNode from "./itemStore.js";
import { repo as layoutRepo } from "./layout/layout.js";

function buildTree(depth, width) {
  const root = new ItemNode();
  root.layout = layoutRepo.get("map");
  function grow(item, remaining) {
    if (remaining === 0) return;
    for (let i = 0; i < width; i++) {
      const child = new ItemNode();
      item.insertChild(child);
      grow(child, remaining - 1);
    }
  }
  grow(root, depth);
  return root;
}

function countNodes(item) {
  return 1 + item.children.reduce((sum, c) => sum + countNodes(c), 0);
}

function findDeepLeaf(root) {
  let node = root;
  while (node.children.length) {
    node = node.children[0];
  }
  return node;
}

// Wraps every item's _computeLayout with a call-counting spy. Must be
// installed AFTER the tree's first layoutResult() pull. createMemo's
// closure (() => this._computeLayout()) looks up `_computeLayout` on
// `this` fresh on every recompute (it's not bound once at construction
// time), so replacing the property after construction is sufficient to
// intercept every future recompute too.
function instrumentTree(root) {
  const calls = new Map();
  function wrap(item) {
    let count = 0;
    const original = item._computeLayout.bind(item);
    item._computeLayout = () => {
      count++;
      calls.set(item.id, count);
      return original();
    };
    item.children.forEach(wrap);
  }
  wrap(root);
  return calls;
}

describe("ItemNode.layoutResult locality (Phase 3.5)", () => {
  const DEPTH = 4;
  const WIDTH = 3; // 1 + 3 + 9 + 27 + 81 = 121 nodes

  it("recomputes only the changed leaf and its ancestors, not unrelated siblings", () => {
    const root = buildTree(DEPTH, WIDTH);
    const totalNodes = countNodes(root);
    root.layoutResult(); // warm up

    const calls = instrumentTree(root);
    const leaf = findDeepLeaf(root);
    // layoutResult() never reads the `text` signal directly (see
    // itemStore.js's _computeLayout()) -- only the measured content
    // size that a real text edit would eventually produce once
    // rendered. setMeasuredSize() is what ItemNodeView's createEffect
    // calls after such a re-render, so this is the correct store-level
    // analog of "this leaf's rendered content changed".
    leaf.setMeasuredSize([90, 44]);
    root.layoutResult();

    // Depth-4 tree: leaf -> parent -> grandparent -> great-grandparent
    // -> root = 5 recomputed nodes, regardless of tree width.
    expect(calls.size).toBe(DEPTH + 1);
    expect(calls.size).toBeLessThan(totalNodes);
  });

  it("does not recompute a collapsed branch's hidden descendants", () => {
    const root = buildTree(DEPTH, WIDTH);
    root.layoutResult(); // warm up
    const collapsedBranch = root.children[0];
    collapsedBranch.collapsed = true;
    root.layoutResult(); // apply the collapse

    const calls = instrumentTree(root);
    const hiddenLeaf = findDeepLeaf(collapsedBranch);
    // A real measured-size change is what would actually invalidate
    // layoutResult() (see the previous test) -- using it here ensures
    // this assertion would genuinely fail if the collapsed guard in
    // _computeLayout() were ever accidentally removed.
    hiddenLeaf.setMeasuredSize([999, 999]);
    root.layoutResult();

    expect(calls.has(hiddenLeaf.id)).toBe(false);
  });

  it("propagates a root color change to every descendant (inheritance, not a locality bug)", () => {
    const root = buildTree(DEPTH, WIDTH);
    const totalNodes = countNodes(root);
    root.layoutResult(); // warm up

    const calls = instrumentTree(root);
    root.color = "#d33";
    root.layoutResult();

    // Matches doc08 Phase 0's own finding for the old engine (121/121
    // visited for a root color change): every descendant's connector
    // generation reads resolvedColor, which chains up through every
    // ancestor's `color` signal -- this is real inheritance
    // propagation, not spurious over-triggering.
    expect(calls.size).toBe(totalNodes);
  });
});
