// Programmatic replacement for docs/06.1-recursive-memo-layout-refactor.md's
// Phase 0 measurement step. That doc's plan referred to layoutSubtree()/
// updateContent()/measureAndSizeContent()/writeLayout() as free functions
// in map.js, but by the time doc06.1 was written those had already been
// folded into item.js's computeLayout() and the per-item
// _updateLayoutContent()/_measureOwnContent()/_writeOwnLayout() methods
// (see item.test.js's instrumentLayout(), which this file reuses the same
// spy-and-count pattern from). Runs entirely under vitest -- no browser
// devtools session required, matching the request to avoid interactive
// console-based measurement.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

function classList() {
  return { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
}

function node() {
  // globalThis.Map, not the mindmap Map class this file imports below
  // (`const { default: Map } = await import("./map.js")`) -- that import
  // shadows the built-in Map within this module, so a plain `new Map()`
  // here would construct a mindmap Map instance (no .set()) instead of a
  // JS Map. Same fix item.test.js's own node() helper already applies.
  const attrs = new globalThis.Map();
  return {
    classList: classList(),
    dataset: {},
    style: {},
    hidden: false,
    innerHTML: "",
    textContent: "",
    contentEditable: "",
    offsetWidth: 40,
    scrollWidth: 40,
    offsetHeight: 20,
    scrollHeight: 20,
    parentNode: null,
    append(...children) {
      children.forEach((c) => (c.parentNode = this));
    },
    appendChild(c) {
      c.parentNode = this;
    },
    insertBefore(c) {
      c.parentNode = this;
    },
    remove: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    querySelector: () => ({ setAttribute: vi.fn() }),
    setAttribute(name, value) {
      attrs.set(name, value);
    },
    getAttribute(name) {
      return attrs.get(name) ?? "0";
    },
    getBBox: () => ({ width: 40, height: 20 }),
  };
}

vi.mock("solid-js", async () => await import("solid-js/dist/solid.js"));
vi.mock("./html.js", () => ({ node }));
vi.mock("./svg.js", () => ({ group: node, foreignObject: node, node }));
vi.mock("./pubsub.js", () => ({ publish: vi.fn() }));
vi.mock("./my-mind.js", () => ({ selectItem: vi.fn() }));
vi.mock("./command/command.js", () => ({ repo: { get: vi.fn() } }));
vi.mock("./shape/shape.js", () => ({
  // update() reads item.resolvedColor, mirroring the minimal real
  // dependency box.js/ellipse.js establish (see their own update()).
  // A no-op vi.fn() here would never read the color memo, so Solid's
  // automatic dependency tracking would never register computeLayout()
  // as depending on item._color() at all -- silently making every
  // color-change scenario measure zero regardless of the real
  // implementation's propagation, the same class of mocking artifact
  // buildTree()'s missing root.layout caused earlier in this file.
  repo: {
    get: (id) => ({
      id,
      update: vi.fn((item) => {
        item.resolvedColor;
      }),
    }),
  },
}));
vi.mock("./layout/layout.js", () => ({
  repo: {
    get: (id) => ({ id, computeAlignment: () => "left", update: vi.fn() }),
  },
}));
vi.mock("./map.js", () => ({ default: class Map {} }));

const { default: Map } = await import("./map.js");
const { default: Item, readItemLayoutResult } = await import("./item.js");

// Builds a WIDTH-ary tree DEPTH levels deep, attached to a Map stand-in so
// readItemLayoutResult() has the parent chain computeLayout()'s "detached
// item" guard needs.
function buildTree(depth, width) {
  const map = new Map();
  const root = new Item();
  root.parent = map;
  // buildTree() wires the tree by hand (root.parent = map) instead of
  // going through Map's own `set root(root)`, so root never gets the
  // explicit layout Map's constructor normally assigns to its internal
  // root. Without it, resolvedLayout resolves to null for the whole
  // tree (no Item ancestor to inherit from), and computeLayout()'s
  // "!item._resolvedLayout()" guard bails out before ever calling
  // _updateLayoutContent/_measureOwnContent/_writeOwnLayout -- silently
  // making every scenario below measure zero, regardless of the real
  // implementation's locality. Matches item.test.js's own stand-in
  // layout object (id/computeAlignment/update) used for the same reason.
  root.layout = {
    id: "map",
    computeAlignment: () => "left",
    update: () => {},
  };
  function grow(item, remaining) {
    if (remaining === 0) return;
    for (let i = 0; i < width; i++) {
      const child = new Item();
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

// Wraps every item in the (sub)tree with call-counting spies on the three
// per-item layout steps computeLayout() drives, and returns the running
// tally plus a reset() so a fresh baseline can be taken after warm-up.
function instrumentTree(root) {
  const calls = { update: 0, measure: 0, write: 0 };
  function wrap(item) {
    const origUpdate = item._updateLayoutContent.bind(item);
    const origMeasure = item._measureOwnContent.bind(item);
    const origWrite = item._writeOwnLayout.bind(item);
    item._updateLayoutContent = () => {
      calls.update++;
      origUpdate();
    };
    item._measureOwnContent = () => {
      calls.measure++;
      origMeasure();
    };
    item._writeOwnLayout = () => {
      calls.write++;
      origWrite();
    };
    item.children.forEach(wrap);
  }
  wrap(root);
  return {
    calls,
    reset() {
      calls.update = 0;
      calls.measure = 0;
      calls.write = 0;
    },
  };
}

// Several levels deep, not the root or a direct child -- matches doc06.1
// Phase 0's "leaf node buried in a 50-100 node tree" scenario.
function findDeepLeaf(root) {
  let node = root;
  while (node.children.length) {
    node = node.children[0];
  }
  return node;
}

describe("doc06.1 Phase 0 locality measurement (programmatic, no browser console)", () => {
  const DEPTH = 4;
  const WIDTH = 3; // 1 + 3 + 9 + 27 + 81 = 121 nodes

  // item.js's `collapsed` setter schedules a double-rAF remeasure (see
  // its own comment) -- irrelevant to this test, which only reads the
  // synchronous layout-memo result, but requestAnimationFrame does not
  // exist in vitest's default node environment. Stubbed for the whole
  // file rather than per-test since any scenario could end up touching
  // `collapsed`.
  let originalRaf;
  beforeAll(() => {
    originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = () => 0;
  });
  afterAll(() => {
    globalThis.requestAnimationFrame = originalRaf;
  });

  // Building/reading a 121-node reactive tree five times (once for the
  // node count, once per scenario) under real Solid reactivity (not a
  // mocked scheduler) is slow enough to exceed vitest's default 5s
  // timeout -- this is inherent to exercising the real memo chain, not
  // an infinite loop, so just give it more room.
  it("logs per-scenario visit counts against total tree size", () => {
    // Each mutator gets a fresh tree, so scenarios never interfere with
    // one another's dirty state.
    const scenarios = {
      "leaf text edit": (root) => {
        findDeepLeaf(root).text = "changed";
      },
      "leaf status/value/icon/notes change": (root) => {
        const leaf = findDeepLeaf(root);
        leaf.status = true;
        leaf.value = 3;
        leaf.icon = "fa-star";
        leaf.notes = "note";
      },
      "middle-node collapse toggle": (root) => {
        root.children[0].collapsed = true;
      },
      // Expected to touch every node, but not because of a single
      // unconditional resolvedColor read: it's the union of two
      // independent paths within the layout memo. (1) Any node with
      // children reads resolvedColor via resolvedLayout.update(), but
      // only once it actually draws a connector line to a child (see
      // layout/graph.js's own comment) -- that's every node at depth
      // 0-3 (40 nodes for this DEPTH/WIDTH tree). (2) Any node whose
      // resolvedShape is "underline" (the default from depth 2 onward)
      // reads resolvedColor via _writeOwnLayout()'s
      // resolvedShape.update() call, regardless of whether it has
      // children -- that's every node at depth 2-4 (117 nodes). The
      // union of these two sets covers depth 0-4, i.e. all 121 nodes,
      // even though neither path alone does.
      "root color change": (root) => {
        root.color = "#d33";
      },
      // Unlike root color change above, this is expected to touch NO
      // nodes (update=0). resolvedTextColor is applied by
      // updateColorStyle() (see item.js's constructor), a separate
      // per-item effect that runs independently of the layout memo
      // instrumented here (docs/06.1-recursive-memo-layout-refactor.md,
      // Phase 7, moved textColor out of _applyOwnStyle() for exactly
      // this reason: it never affects the measured content box, so it
      // has no reason to be part of the layout memo's tracked scope).
      // Kept as a scenario so this stays documented rather than
      // silently dropped -- update=0 here is a true negative, not a
      // measurement gap.
      "root textColor change": (root) => {
        root.textColor = "#d33";
      },
    };

    const totalNodes = countNodes(buildTree(DEPTH, WIDTH));
    console.log(`total nodes in tree: ${totalNodes}`);

    for (const [name, mutate] of Object.entries(scenarios)) {
      const root = buildTree(DEPTH, WIDTH);
      // Warm up once before instrumenting, so the counted run reflects
      // only the mutation itself, not the tree's initial construction.
      readItemLayoutResult(root);
      const { calls, reset } = instrumentTree(root);
      reset();
      mutate(root);
      readItemLayoutResult(root);
      console.log(
        `${name}: update=${calls.update} measure=${calls.measure} write=${calls.write} / total=${totalNodes}`,
      );
      if (name !== "root color change" && name !== "root textColor change") {
        expect(calls.update).toBeLessThan(totalNodes);
      }
    }
  }, 20000);

  // Visit-count locality (above) doesn't tell us whether a full-tree
  // visit is actually slow in wall-clock terms -- doc08's rationale for
  // a large rewrite only holds if this cost is user-visible. Measures
  // real elapsed time instead of node counts, on a tree well past the
  // "100+" size doc08's own proposal names. This is a soft sanity check
  // (catches a catastrophic regression, e.g. an accidental O(n^2) pass),
  // not a strict perf gate -- absolute timings are environment-dependent
  // (CI runner speed, JIT warm-up, ...), so the assertion threshold is
  // deliberately generous. The logged numbers, not the assertion, are
  // the actual result to record in docs/08-mindmap-engine-refactor.md.
  it("benchmarks wall-clock time: leaf edit vs. full-tree color propagation", () => {
    const BENCH_DEPTH = 4;
    const BENCH_WIDTH = 5; // 1 + 5 + 25 + 125 + 625 = 781 nodes
    const root = buildTree(BENCH_DEPTH, BENCH_WIDTH);
    const totalNodes = countNodes(root);
    readItemLayoutResult(root); // warm up: exclude tree construction from the timing

    const leafStart = performance.now();
    findDeepLeaf(root).text = "changed";
    readItemLayoutResult(root);
    const leafMs = performance.now() - leafStart;

    const colorStart = performance.now();
    root.color = "#d33";
    readItemLayoutResult(root);
    const colorMs = performance.now() - colorStart;

    console.log(
      `benchmark (${totalNodes} nodes): leaf text edit = ${leafMs.toFixed(3)}ms, ` +
        `root color change (full-tree propagation) = ${colorMs.toFixed(3)}ms`,
    );

    // Sanity bound only, not a real perf budget -- see comment above.
    expect(colorMs).toBeLessThan(2000);
  }, 20000);
});
