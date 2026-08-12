import { describe, expect, it, vi, beforeEach } from "vitest";

const mockActiveMode = { value: "canvas" };
vi.mock("./store.js", () => ({ activeMode: () => mockActiveMode.value }));
vi.mock("./newEdit.js", () => ({ startEditing: vi.fn(() => ({})) }));

const { handleItemClick, handleItemDblClick } = await import("./newMouse.js");
const {
  currentItem,
  setCurrentItem,
  selectedItems,
  setSelectedItems,
  editing,
  setEditing,
} = await import("./itemSelection.js");
const { startEditing } = await import("./newEdit.js");

function resetSelectionState() {
  setCurrentItem(null);
  setSelectedItems(new Set());
  setEditing(false);
}

describe("newMouse.js handleItemClick (Phase 4.3)", () => {
  beforeEach(() => {
    mockActiveMode.value = "canvas";
    resetSelectionState();
  });

  it("selects the clicked item on a plain click", () => {
    const item = { id: "a" };
    handleItemClick(item, {});

    expect(currentItem()).toBe(item);
  });

  it("Ctrl+click adds to the multi-selection instead of replacing currentItem", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    setCurrentItem(a);

    handleItemClick(b, { ctrlKey: true });

    expect(currentItem()).toBe(a);
    expect(selectedItems().has(b)).toBe(true);
  });

  it("Cmd (metaKey)+click also adds to the multi-selection", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    setCurrentItem(a);

    handleItemClick(b, { metaKey: true });

    expect(selectedItems().has(b)).toBe(true);
  });

  it("ignores clicks while the canvas is backgrounded", () => {
    mockActiveMode.value = "notes";
    const item = { id: "a" };

    handleItemClick(item, {});

    expect(currentItem()).toBeNull();
  });
});

describe("newMouse.js handleItemDblClick (Phase 4.5)", () => {
  beforeEach(() => {
    mockActiveMode.value = "canvas";
    resetSelectionState();
    vi.clearAllMocks();
  });

  it("starts editing on double-click", () => {
    const item = { id: "a" };
    handleItemDblClick(item, {});

    expect(startEditing).toHaveBeenCalledWith(item);
    expect(editing()).toBe(true);
  });

  it("does not enter editing mode if startEditing() finds no DOM ref", () => {
    startEditing.mockReturnValueOnce(null);
    const item = { id: "a" };
    handleItemDblClick(item, {});

    expect(editing()).toBe(false);
  });

  it("ignores double-clicks while the canvas is backgrounded", () => {
    mockActiveMode.value = "notes";
    const item = { id: "a" };
    handleItemDblClick(item, {});

    expect(startEditing).not.toHaveBeenCalled();
  });
});
