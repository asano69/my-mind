import { describe, expect, it, beforeEach } from "vitest";
import {
  currentItem,
  setCurrentItem,
  selectedItems,
  setSelectedItems,
  isCurrent,
  isSelected,
  itemStateClassList,
} from "./itemSelection.js";

// Phase 4.2 of docs/08-mindmap-engine-refactor.md: selection state only
// -- no click/keyboard wiring exists yet (see Phase 4.3/4.4), so these
// tests exercise the signals directly, the same "call a test-only setter
// and check the derived display state" approach the plan calls for.

function resetSelectionState() {
  setCurrentItem(null);
  setSelectedItems(new Set());
}

describe("itemSelection.js", () => {
  beforeEach(resetSelectionState);

  it("currentItem defaults to null", () => {
    expect(currentItem()).toBeNull();
  });

  it("isCurrent() reflects setCurrentItem()", () => {
    const item = { id: "a" };
    expect(isCurrent(item)).toBe(false);

    setCurrentItem(item);
    expect(isCurrent(item)).toBe(true);
    expect(isCurrent({ id: "b" })).toBe(false);
  });

  it("selectedItems defaults to an empty Set", () => {
    expect(selectedItems().size).toBe(0);
  });

  it("isSelected() reflects a freshly-swapped Set (in-place mutation would not be tracked)", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    expect(isSelected(a)).toBe(false);

    setSelectedItems(new Set([a]));
    expect(isSelected(a)).toBe(true);
    expect(isSelected(b)).toBe(false);

    setSelectedItems(new Set([a, b]));
    expect(isSelected(b)).toBe(true);
  });

  it("itemStateClassList combines current/selected for classList binding", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    setCurrentItem(a);
    setSelectedItems(new Set([b]));

    expect(itemStateClassList(a)).toEqual({ current: true, selected: false });
    expect(itemStateClassList(b)).toEqual({ current: false, selected: true });
    expect(itemStateClassList({ id: "c" })).toEqual({
      current: false,
      selected: false,
    });
  });
});
