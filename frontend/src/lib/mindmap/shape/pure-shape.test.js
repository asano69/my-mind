import { describe, expect, it } from "vitest";
import { computeBoxStyle } from "./box.js";
import { computeEllipseStyle } from "./ellipse.js";
import { computeUnderlinePath } from "./underline.js";

// Phase 3.7 of docs/08-mindmap-engine-refactor.md: regression tests for
// the DOM-free style/path descriptors extracted out of shape/box.js,
// shape/ellipse.js, and shape/underline.js's update() methods. These
// are the same functions NewMindMapPreview.jsx now calls instead of
// duplicating this branching in its own shapeStyle()/underlinePathFor().

describe("computeBoxStyle", () => {
  it("uses the item's own explicit color", () => {
    expect(computeBoxStyle({ color: "#d33", resolvedColor: "#d33" })).toEqual({
      itemColor: "#d33",
      borderColor: null,
    });
  });

  it("falls back to an inherited (non-default) resolved color", () => {
    expect(computeBoxStyle({ color: "", resolvedColor: "#3d3" })).toEqual({
      itemColor: "#3d3",
      borderColor: null,
    });
  });

  it("uses border-color once nothing in the chain has an explicit color", () => {
    expect(computeBoxStyle({ color: "", resolvedColor: "#999" })).toEqual({
      itemColor: null,
      borderColor: "#999",
    });
  });
});

describe("computeEllipseStyle", () => {
  it("uses the item's own explicit color", () => {
    expect(
      computeEllipseStyle({ color: "#d33", resolvedColor: "#d33" }),
    ).toEqual({ itemColor: "#d33", borderColor: null });
  });

  it("never falls back to an inherited color for --item-color", () => {
    expect(computeEllipseStyle({ color: "", resolvedColor: "#3d3" })).toEqual({
      itemColor: null,
      borderColor: "#3d3",
    });
  });
});

describe("computeUnderlinePath", () => {
  it("draws a horizontal line under the content box", () => {
    const item = {
      contentPosition: [10, 20],
      contentSize: [100, 30],
      resolvedColor: "#abc",
    };
    expect(computeUnderlinePath(item)).toEqual({
      d: "M 10 46.5 L 110 46.5",
      stroke: "#abc",
    });
  });
});
