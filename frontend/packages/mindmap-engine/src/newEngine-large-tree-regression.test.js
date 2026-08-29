import { describe, it, expect, beforeEach, vi } from "vitest";

// Use the synchronous dist build (same workaround as item.test.js/
// itemStore.test.js/itemStore-layout-locality.test.js/
// NewMindMapPreview.test.jsx) so a memo's recomputation (layoutResult)
// is visible to a plain synchronous read immediately after the signal
// write that invalidated it (setMeasuredSize(), history.back()/
// forward()'s underlying signal writes, ...). The default "solid-js"
// export schedules signal propagation on a microtask, which this
// file's synchronous assertions (mutate, then immediately read
// layoutResult()) can't observe -- omitting this mock is exactly why
// every _computeLayout() call count below read back as 0.
vi.mock("solid-js", async () => await import("solid-js/dist/solid.js"));

// Phase 4.10 of docs/08-mindmap-engine-refactor.md: re-measurement
// gate for Phase 4 as a whole. Earlier phases (3.5, 4.7.4) each checked
// ONE isolated mutation's locality (a single text edit, a single drag).
// This file chains several real operations -- edit, drag-and-drop,
// undo, redo -- through the actual newAction.js/newEdit.js pipeline on
// the same tree, back to back, and confirms an untouched third branch
// is never recomputed at any point in the sequence. This is the
// "実際のドラッグ&ドロップ・編集・undo/redo操作を経由するシナリオへの
// 拡張" the plan calls for, compared against doc06.1's baseline
// (5/121 for a leaf edit, matching what this file also expects for the
// new engine's equivalent step).
import "./shape/box.js";
import "./shape/ellipse.js";
import "./shape/underline.js";
import "./layout/graph.js";
import "./layout/tree.js";
import "./layout/map.js";

import ItemNode from "./itemStore.js";
import { repo as layoutRepo } from "./layout/layout.js";
import { createHistory } from "./history.js";
import { createItemSelection } from "./itemSelection.js";
import { createActions, SetText } from "./newAction.js";

// Local, independent instance -- see docs/mind-map-core-engine-library/
// 01-plan.md's Step 5: history.js/itemSelection.js/newAction.js no
// longer have module-level default singletons to fall back to, so this
// file builds its own instances and wires createActions() to them
// explicitly.
const history = createHistory();
const selection = createItemSelection();
const { setCurrentItem } = selection;
const { action, MoveItem } = createActions(history, selection.selectItem);

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

function findDeepLeaf(item) {
  let node = item;
  while (node.children.length) {
    node = node.children[0];
  }
  return node;
}

function collectIds(item, into = new Set()) {
  into.add(item.id);
  item.children.forEach((c) => collectIds(c, into));
  return into;
}

// Same call-counting spy pattern as itemStore-layout-locality.test.js /
// newMouse-drag-locality.test.js -- must be installed after the tree's
// first layoutResult() pull, since createMemo looks up `_computeLayout`
// fresh from `this` on every recompute.
function instrumentTree(root) {
  const calls = new Map();
  function wrap(item) {
    const original = item._computeLayout.bind(item);
    item._computeLayout = () => {
      calls.set(item.id, (calls.get(item.id) ?? 0) + 1);
      return original();
    };
    item.children.forEach(wrap);
  }
  wrap(root);
  return calls;
}

describe("Phase 4.10: chained edit -> drag -> undo -> redo locality", () => {
  const DEPTH = 4;
  const WIDTH = 3; // 1 + 3 + 9 + 27 + 81 = 121 nodes, matching doc06.1/doc08 Phase 0's baseline tree shape

  beforeEach(() => {
    history.reset();
    setCurrentItem(null);
  });

  it("never touches an untouched third branch across a realistic edit+drag+undo+redo sequence", () => {
    const root = buildTree(DEPTH, WIDTH);
    const totalNodes = countNodes(root);
    root.layoutResult(); // warm up

    // Branch A: where we'll edit a leaf. Branch B: drag target. Branch
    // C: must stay untouched through the whole sequence below.
    const [branchA, branchB, branchC] = root.children;
    const untouchedIds = collectIds(branchC);

    const calls = instrumentTree(root);

    // Step 1: edit a deep leaf's text via the real undo-tracked action.
    // Writing `text` alone does not invalidate layoutResult -- unlike
    // the old engine's item.js (where updateText()'s effect calls
    // _bumpContentVersion() automatically), itemStore.js's
    // _computeLayout() never reads the `text` signal directly (see its
    // own comment: content size only changes once something actually
    // remeasures the DOM). newEdit.js's commitEditing() mirrors this by
    // calling setMeasuredSize() right after committing the SetText
    // action -- do the same here to simulate a real edit-then-remeasure
    // instead of a text write with no observable layout effect.
    const editedLeaf = findDeepLeaf(branchA);
    action(new SetText(editedLeaf, "edited"));
    editedLeaf.setMeasuredSize([90, 44]);
    root.layoutResult();

    // Step 2: drag a different leaf from branch A into branch B (append).
    const draggedLeaf = branchA.children[0];
    action(new MoveItem(draggedLeaf, branchB));
    root.layoutResult();

    // Step 3: undo the drag.
    history.back();
    root.layoutResult();

    // Step 4: redo the drag.
    history.forward();
    root.layoutResult();

    // Step 5: undo everything (redo, drag, edit) back to the original state.
    history.back(); // undo the drag again
    history.back(); // undo the edit
    root.layoutResult();

    for (const id of untouchedIds) {
      expect(calls.has(id)).toBe(false);
    }

    // Sanity: the sequence actually touched something (not a no-op test).
    expect(calls.size).toBeGreaterThan(0);
    expect(calls.size).toBeLessThan(totalNodes);
  });

  it("keeps a single leaf edit's recompute count in line with doc06.1's baseline (depth+1 nodes)", () => {
    const root = buildTree(DEPTH, WIDTH);
    root.layoutResult(); // warm up

    const calls = instrumentTree(root);
    const leaf = findDeepLeaf(root);
    // See the previous test's comment: a text write alone does not
    // invalidate layoutResult here -- pair it with setMeasuredSize(),
    // mirroring newEdit.js's commitEditing() sequence.
    action(new SetText(leaf, "changed"));
    leaf.setMeasuredSize([90, 44]);
    root.layoutResult();

    // leaf -> parent -> grandparent -> great-grandparent -> root = 5
    // nodes for a depth-4 tree, matching doc06.1 Phase 0's "leaf edit ="
    // 5/121" baseline and itemStore-layout-locality.test.js's own
    // assertion for the non-action-routed case.
    expect(calls.size).toBe(DEPTH + 1);

    history.back();
  });

  it("stays proportional to tree depth (not size) on a larger tree across a full edit+drag+undo sequence", () => {
    const BIG_DEPTH = 4;
    const BIG_WIDTH = 5; // 1 + 5 + 25 + 125 + 625 = 781 nodes
    const root = buildTree(BIG_DEPTH, BIG_WIDTH);
    const totalNodes = countNodes(root);
    root.layoutResult(); // warm up

    const [branchA, branchB] = root.children;
    const draggedLeaf = findDeepLeaf(branchA);

    const calls = instrumentTree(root);
    // See the first test's comment: pair the text write with
    // setMeasuredSize() to mirror newEdit.js's actual commit sequence.
    action(new SetText(draggedLeaf, "edited"));
    draggedLeaf.setMeasuredSize([90, 44]);
    root.layoutResult();
    action(new MoveItem(draggedLeaf, branchB));
    root.layoutResult();
    history.back();
    root.layoutResult();

    // Well under the tree's total size -- proportional to the small
    // number of root-to-branch paths actually touched, not the whole
    // 781-node tree. Mirrors the loose relative bound used in
    // newMouse-drag-locality.test.js's own large-tree check.
    expect(calls.size).toBeLessThan(totalNodes / 10);
  });
});

// Manual verification checklist (browser, not covered by vitest's node
// environment -- see Phase 3.6's own progress note for the same
// limitation on foreignObject paint timing):
//
// - Open a saved map with 50-100+ nodes via `?newEngine=1`.
// - Edit a deep leaf's text, drag a node between branches, collapse/
//   expand a branch, undo/redo several times: confirm no visible lag
//   or dropped frames beyond what doc08 Phase 0's 39ms/781-node
//   full-tree-propagation benchmark already predicts for inheritance-
//   chain operations (color/textColor/shape/layout changes only).
// - Confirm dragging into a still-collapsed node and expanding it does
//   not leave stale/zero-sized content (the bug documented in
//   docs/06.1-recursive-memo-layout-refactor.md's Post-Phase-7 note for
//   the old engine) -- Phase 3.6 already checked this for the new
//   engine's collapse/expand path without drag-and-drop; this adds the
//   drag-into-collapsed-node combination specifically.
//
// This checklist is recorded here rather than executed automatically,
// consistent with Phase 3.6's own scope (vitest has no browser paint
// timing to observe).
