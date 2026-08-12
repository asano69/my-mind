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
  const attrs = new Map();
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
  repo: { get: (id) => ({ id, update: vi.fn() }) },
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
      // Expected (per doc05.1/06.1's own design notes) to touch the whole
      // subtree via the resolvedColor inheritance chain -- kept here as a
      // baseline reading, not as a locality regression check.
      "root color change": (root) => {
        root.color = "#d33";
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
      if (name !== "root color change") {
        expect(calls.update).toBeLessThan(totalNodes);
      }
    }
  }, 20000);
});
