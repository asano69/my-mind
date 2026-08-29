import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Stage 4.7.4 of docs/08-phase4.7-drag-and-drop-refactor.md: confirms
// that completing a drag-and-drop move through newAction.js's MoveItem
// (the same action finishNewDragDrop() in newMouse.js dispatches, see
// Stage 4.7.3) does not regress the layoutResult locality established
// in Phase 3.5 (see itemStore-layout-locality.test.js) -- a move should
// only recompute layoutResult for the two affected branches (the moved
// item's old parent chain and its new parent chain), never an unrelated
// sibling branch.
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
import { createActions } from "./newAction.js";

// Local, independent instance -- see docs/mind-map-core-engine-library/
// 01-plan.md's Step 5: newAction.js no longer has a module-level
// default singleton to fall back to, so this file builds its own
// history/selection and wires createActions() to them explicitly.
const history = createHistory();
const selection = createItemSelection();
const { action, MoveItem } = createActions(history, selection.selectItem);

// Same WIDTH-ary tree builder as itemStore-layout-locality.test.js,
// duplicated here (rather than imported) since that file does not
// export it -- both files independently mirror
// layout-measurement.test.js's original buildTree() pattern.
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

// Wraps every item's _computeLayout with a call-counting spy, mirroring
// itemStore-layout-locality.test.js's instrumentTree(). Must be
// installed AFTER the tree's first layoutResult() pull -- see that
// file's own comment for why (createMemo looks up _computeLayout fresh
// on every recompute, so replacing it post-construction is enough).
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

describe("drag-and-drop move locality (Stage 4.7.4)", () => {
  const DEPTH = 4;
  const WIDTH = 3; // 1 + 3 + 9 + 27 + 81 = 121 nodes

  // Each test dispatches through newAction.js's action(), which pushes
  // onto history.js's shared undo stack -- reset it so one test's move
  // never leaks into another's canBack()/canForward() state.
  beforeAll(() => history.reset());
  afterAll(() => history.reset());

  it("never touches an unrelated sibling branch when moving a leaf into a different branch", () => {
    const root = buildTree(DEPTH, WIDTH);
    root.layoutResult(); // warm up

    // root.children[0] is where the dragged leaf currently lives;
    // root.children[1] is the drop target; root.children[2] is an
    // entirely unrelated third branch that must never be recomputed.
    const draggedLeaf = findDeepLeaf(root.children[0]);
    const dropTarget = root.children[1];
    const untouchedBranchRoot = root.children[2];

    const calls = instrumentTree(root);
    action(new MoveItem(draggedLeaf, dropTarget));
    root.layoutResult();

    const untouchedIds = new Set();
    (function collect(item) {
      untouchedIds.add(item.id);
      item.children.forEach(collect);
    })(untouchedBranchRoot);

    for (const id of untouchedIds) {
      expect(calls.has(id)).toBe(false);
    }
  });

  it("keeps the recompute count proportional to tree depth, not tree size, on a larger tree", () => {
    const BIG_DEPTH = 4;
    const BIG_WIDTH = 5; // 1 + 5 + 25 + 125 + 625 = 781 nodes
    const root = buildTree(BIG_DEPTH, BIG_WIDTH);
    const totalNodes = countNodes(root);
    root.layoutResult(); // warm up

    const draggedLeaf = findDeepLeaf(root.children[0]);
    const dropTarget = root.children[1];

    const calls = instrumentTree(root);
    action(new MoveItem(draggedLeaf, dropTarget));
    root.layoutResult();

    // Only the two affected root-to-branch paths should ever recompute;
    // well under the 781-node total either way. A loose relative bound
    // (rather than an exact count) avoids over-fitting this test to the
    // precise set of signals layoutResult happens to read today.
    expect(calls.size).toBeLessThan(totalNodes / 10);
  });
});
