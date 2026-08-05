import { describe, it, expect, vi } from "vitest";

// Map is imported for its class/prototype only -- new Map() is never
// called, so its constructor (which sets up Solid signals/computeds and
// touches real DOM APIs) never runs. Everything Map's module scope pulls
// in transitively is mocked out, matching the pattern used by
// item.test.js/action.item.test.js.
vi.mock("./item.js", () => ({
  default: class Item {},
  readItemLayoutResult: vi.fn(() => [0, 0]),
}));
vi.mock("./layout/layout.js", () => ({
  repo: { get: vi.fn(() => ({ id: "map" })) },
}));
vi.mock("./svg.js", () => ({
  node: vi.fn(() => ({ style: {}, append: vi.fn(), setAttribute: vi.fn() })),
}));
vi.mock("./html.js", () => ({ node: vi.fn(() => ({ textContent: "" })) }));
vi.mock("./my-mind.js", () => ({
  currentItem: null,
  editing: false,
  selectItem: vi.fn(),
  stopEditing: vi.fn(),
}));
vi.mock("./store.js", () => ({ bumpDirty: vi.fn() }));
vi.mock("./format/format.js", () => ({ br2nl: (s) => s }));
vi.mock("./map.css?raw", () => ({ default: "" }));

const { default: Map } = await import("./map.js");

function fakeMap(moveBy) {
  return {
    node: {
      parentNode: {
        getBoundingClientRect: () => ({
          left: 0,
          right: 800,
          top: 0,
          bottom: 600,
        }),
      },
    },
    moveBy,
  };
}

// Regression test for the "dropping a node into a collapsed node shifts
// the whole map" bug: the moved item becomes display:none (hidden by
// its new collapsed ancestor), and getBoundingClientRect() on a
// display:none element returns an all-zero rect, which used to be
// misread as "way off-screen", triggering a large spurious moveBy().
describe("Map.prototype.ensureItemVisibility", () => {
  it("does nothing for an item hidden by a collapsed ancestor", () => {
    const moveBy = vi.fn();
    const hiddenItem = {
      dom: {
        content: {
          getClientRects: () => [],
          getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0 }),
        },
      },
    };

    Map.prototype.ensureItemVisibility.call(fakeMap(moveBy), hiddenItem);

    expect(moveBy).not.toHaveBeenCalled();
  });

  it("still scrolls a visible item that is off-screen", () => {
    const moveBy = vi.fn();
    const offscreenItem = {
      dom: {
        content: {
          getClientRects: () => [{}],
          getBoundingClientRect: () => ({ left: -50, top: 10, right: 20, bottom: 40 }),
        },
      },
    };

    Map.prototype.ensureItemVisibility.call(fakeMap(moveBy), offscreenItem);

    expect(moveBy).toHaveBeenCalled();
  });
});
