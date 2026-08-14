// New-engine counterpart to layout-measurement.test.js. That file
// measures item.js's (old engine) per-item update/measure/write visit
// counts across five scenarios; this file drives the exact same five
// scenarios against itemStore.js's ItemNode.layoutResult (the new
// engine, see docs/08-mindmap-engine-refactor.md's Phase 3.5), on a
// tree of the same shape (depth 4, width 3, 121 nodes), so the two
// console.log outputs can be compared line by line.
//
// Two structural differences from the old engine mean the scenarios
// aren't a byte-for-byte port -- both are noted inline where relevant:
//
// 1. layoutResult()'s computation (_computeLayout(), see itemStore.js)
//    never reads text/status/value/icon/notes directly -- only the
//    measured content size (_measuredSize, written via
//    setMeasuredSize()) affects it. In the real app, ItemNodeView's own
//    createEffect (see NewMindMapPreview.jsx) watches those fields and
//    calls setMeasuredSize() once they change. Each scenario below
//    pairs the data mutation with that follow-up setMeasuredSize() call
//    to mirror what actually happens end-to-end, rather than mutating a
//    field that layoutResult would silently ignore.
// 2. Shape/color rendering (box/ellipse/underline style, the underline
//    connector path) is not part of _computeLayout() at all in the new
//    engine -- it lives in NewMindMapPreview.jsx's JSX instead. So the
//    "root color change" scenario is expected to touch fewer nodes than
//    the old engine's 121/121 (see itemStore-layout-locality.test.js's
//    own finding: only nodes that actually draw a connector to a child
//    read resolvedColor). This is a real, already-documented locality
//    improvement, not a discrepancy to "fix".
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Registers shape/layout kinds into their repos, same side-effect-import
// pattern every other itemStore.js test file uses.
import "./shape/box.js";
import "./shape/ellipse.js";
import "./shape/underline.js";
import "./layout/graph.js";
import "./layout/tree.js";
import "./layout/map.js";

// Use the synchronous dist build (same workaround as itemStore.test.js/
// itemStore-layout-locality.test.js) so layoutResult's recomputation is
// visible to a plain synchronous read immediately after the signal
// write that invalidated it.
vi.mock("solid-js", async () => await import("solid-js/dist/solid.js"));

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
// installed AFTER the tree's first layoutResult() pull -- createMemo's
// closure looks up `_computeLayout` on `this` fresh on every recompute,
// so replacing the property post-construction is sufficient to
// intercept every future recompute too (same pattern as
// itemStore-layout-locality.test.js's instrumentTree()).
function instrumentTree(root) {
  const calls = { computeLayout: 0 };
  function wrap(item) {
    const original = item._computeLayout.bind(item);
    item._computeLayout = () => {
      calls.computeLayout++;
      return original();
    };
    item.children.forEach(wrap);
  }
  wrap(root);
  return calls;
}

describe("new-engine layout-locality measurement (doc08 Phase 3.5, compare against layout-measurement.test.js)", () => {
  const DEPTH = 4;
  const WIDTH = 3; // 1 + 3 + 9 + 27 + 81 = 121 nodes, matching the old engine's tree shape

  it("logs per-scenario visit counts against total tree size", () => {
    const scenarios = {
      // Old engine: item.text = "changed" alone triggers a remeasure
      // (updateText()'s own effect bumps contentVersion). New engine:
      // text itself is inert for layoutResult -- pair it with the
      // setMeasuredSize() call ItemNodeView's effect would really make
      // right after a committed edit (see newEdit.js's commitEditing()).
      "leaf text edit": (root) => {
        const leaf = findDeepLeaf(root);
        leaf.text = "changed";
        leaf.setMeasuredSize([90, 44]);
      },
      // Old engine bumps three times here (status/icon/value each bump
      // independently, notes never bumps -- see layout-measurement.test.js's
      // own comment), giving 15 = 5*3. New engine's ItemNodeView watches
      // all four fields in a single createEffect, so a real batched DOM
      // update fires exactly one setMeasuredSize() call regardless of
      // how many of the four fields changed together.
      "leaf status/value/icon/notes change": (root) => {
        const leaf = findDeepLeaf(root);
        leaf.status = true;
        leaf.value = 3;
        leaf.icon = "fa-star";
        leaf.notes = "note";
        leaf.setMeasuredSize([90, 44]);
      },
      // collapsed is read directly inside _computeLayout() (the
      // childLayouts guard), so this needs no accompanying
      // setMeasuredSize() call -- toggling it alone invalidates the
      // item's own layoutResult and its ancestors', same as the old
      // engine's collapsed setter.
      "middle-node collapse toggle": (root) => {
        root.children[0].collapsed = true;
      },
      // color is read (conditionally) by computeLinesHorizontal/Vertical
      // (layout/graph.js) whenever a connector to a child is actually
      // drawn -- see itemStore-layout-locality.test.js's own finding
      // that this is strictly narrower than the old engine's 121/121,
      // since shape/underline-path rendering is not part of
      // _computeLayout() here at all (see this file's header comment).
      "root color change": (root) => {
        root.color = "#d33";
      },
      // textColor is never read by _computeLayout() or the pure
      // layout/*.js functions it calls -- expected to touch 0 nodes,
      // matching the old engine's own 0 (textColor styling lives in a
      // separate, non-layout code path in both engines: item.js's
      // updateColorStyle() effect for the old engine, JSX's
      // textStyleFor() for the new one).
      "root textColor change": (root) => {
        root.textColor = "#d33";
      },
    };

    const totalNodes = countNodes(buildTree(DEPTH, WIDTH));
    console.log(`[new engine] total nodes in tree: ${totalNodes}`);

    for (const [name, mutate] of Object.entries(scenarios)) {
      const root = buildTree(DEPTH, WIDTH);
      root.layoutResult(); // warm up before instrumenting
      const calls = instrumentTree(root);
      mutate(root);
      root.layoutResult();
      console.log(
        `[new engine] ${name}: computeLayout=${calls.computeLayout} / total=${totalNodes}`,
      );
      if (name !== "root color change") {
        expect(calls.computeLayout).toBeLessThan(totalNodes);
      }
    }

    // Pin down the two scenarios whose numeric locality is a specific,
    // meaningful claim (not just "less than total") so a future
    // regression in either direction gets caught, not just logged.
    {
      const root = buildTree(DEPTH, WIDTH);
      root.layoutResult();
      const calls = instrumentTree(root);
      const leaf = findDeepLeaf(root);
      leaf.setMeasuredSize([90, 44]);
      root.layoutResult();
      // leaf -> parent -> grandparent -> great-grandparent -> root
      expect(calls.computeLayout).toBe(DEPTH + 1);
    }
    {
      const root = buildTree(DEPTH, WIDTH);
      root.layoutResult();
      const calls = instrumentTree(root);
      root.color = "#d33";
      root.layoutResult();
      // Every node with at least one child draws (or at least attempts)
      // a connector and reads resolvedColor while doing so; leaves never
      // draw an outgoing connector and so never read it. For a
      // depth-4/width-3 tree, that's every non-leaf: 121 - 3^4 = 40.
      const leafCount = WIDTH ** DEPTH;
      expect(calls.computeLayout).toBe(totalNodes - leafCount);
    }
    {
      const root = buildTree(DEPTH, WIDTH);
      root.layoutResult();
      const calls = instrumentTree(root);
      root.textColor = "#d33";
      root.layoutResult();
      expect(calls.computeLayout).toBe(0);
    }
  }, 20000);

  // Wall-clock counterpart to the visit-count check above, mirroring
  // layout-measurement.test.js's own benchmark -- same tree size (781
  // nodes) so the two numbers can be compared directly.
  it("benchmarks wall-clock time: leaf edit vs. full-tree color propagation", () => {
    const BENCH_DEPTH = 4;
    const BENCH_WIDTH = 5; // 1 + 5 + 25 + 125 + 625 = 781 nodes
    const root = buildTree(BENCH_DEPTH, BENCH_WIDTH);
    const totalNodes = countNodes(root);
    root.layoutResult(); // warm up: exclude tree construction from the timing

    const leaf = findDeepLeaf(root);
    const leafStart = performance.now();
    leaf.setMeasuredSize([90, 44]);
    root.layoutResult();
    const leafMs = performance.now() - leafStart;

    const colorStart = performance.now();
    root.color = "#d33";
    root.layoutResult();
    const colorMs = performance.now() - colorStart;

    console.log(
      `[new engine] benchmark (${totalNodes} nodes): leaf edit = ${leafMs.toFixed(3)}ms, ` +
        `root color change (partial-tree propagation) = ${colorMs.toFixed(3)}ms`,
    );

    // Sanity bound only, not a real perf budget -- see
    // layout-measurement.test.js's own comment on the same choice.
    expect(colorMs).toBeLessThan(2000);
  }, 20000);
});
