import { describe, expect, it, beforeEach } from "vitest";
import { createItemSelection } from "./itemSelection.js";

// Local, independent instance -- see docs/mind-map-core-engine-library/
// 01-plan.md's Step 5: itemSelection.js no longer has a module-level
// default singleton to fall back to, so this file builds its own
// instance instead.
const {
  currentItem,
  setCurrentItem,
  selectedItems,
  setSelectedItems,
  isCurrent,
  isSelected,
  itemStateClassList,
  clearMultiSelection,
  selectItem,
  addToSelection,
  editing,
  setEditing,
} = createItemSelection();

// Phase 4.2 of docs/08-mindmap-engine-refactor.md: selection state only
// -- no click/keyboard wiring exists yet (see Phase 4.3/4.4), so these
// tests exercise the signals directly, the same "call a test-only setter
// and check the derived display state" approach the plan calls for.

function resetSelectionState() {
  setCurrentItem(null);
  setSelectedItems(new Set());
  setEditing(false);
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

  describe("selectItem", () => {
    it("sets currentItem and clears any multi-selection", () => {
      const a = { id: "a" };
      const b = { id: "b" };
      setSelectedItems(new Set([b]));

      selectItem(a);

      expect(currentItem()).toBe(a);
      expect(selectedItems().size).toBe(0);
    });
  });

  describe("clearMultiSelection", () => {
    it("empties selectedItems without touching currentItem", () => {
      const a = { id: "a" };
      const b = { id: "b" };
      setCurrentItem(a);
      setSelectedItems(new Set([b]));

      clearMultiSelection();

      expect(currentItem()).toBe(a);
      expect(selectedItems().size).toBe(0);
    });
  });

  describe("addToSelection", () => {
    it("adds a not-yet-selected item to the multi-selection", () => {
      const a = { id: "a" };
      const b = { id: "b" };
      setCurrentItem(a);

      addToSelection(b);

      expect(isSelected(b)).toBe(true);
      expect(currentItem()).toBe(a);
    });

    it("toggles off an already-selected item", () => {
      const a = { id: "a" };
      const b = { id: "b" };
      setCurrentItem(a);
      setSelectedItems(new Set([b]));

      addToSelection(b);

      expect(isSelected(b)).toBe(false);
    });

    it("toggling off the current item promotes another selected item to current", () => {
      const a = { id: "a" };
      const b = { id: "b" };
      setCurrentItem(a);
      setSelectedItems(new Set([b]));

      addToSelection(a);

      expect(currentItem()).toBe(b);
      expect(isSelected(b)).toBe(false);
    });

    it("toggling off the current item with nothing else selected is a no-op", () => {
      const a = { id: "a" };
      setCurrentItem(a);

      addToSelection(a);

      expect(currentItem()).toBe(a);
      expect(selectedItems().size).toBe(0);
    });
  });
});

describe("editing (Phase 4.5)", () => {
  beforeEach(() => setEditing(false));

  it("defaults to false and can be toggled", () => {
    expect(editing()).toBe(false);
    setEditing(true);
    expect(editing()).toBe(true);
    setEditing(false);
    expect(editing()).toBe(false);
  });
});
