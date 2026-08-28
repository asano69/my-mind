import { beforeEach, describe, expect, it } from "vitest";

// Registers layout/shape kinds into their repos, the same side-effect
// import pattern my-mind.js uses -- needed so insertChild()/
// resolvedLayout/resolvedShape resolve real instances, matching
// itemStore.test.js's own setup.
import "./shape/box.js";
import "./shape/ellipse.js";
import "./shape/underline.js";
import "./layout/graph.js";
import "./layout/tree.js";
import "./layout/map.js";

import ItemNode from "./itemStore.js";
import { repo as layoutRepo } from "./layout/layout.js";
import * as history from "./history.js";
import { currentItem, setCurrentItem } from "./itemSelection.js";
import {
  action,
  InsertNewItem,
  AppendItem,
  RemoveItem,
  MoveItem,
  Swap,
  SetText,
  SetColor,
  SetStatus,
  SetValue,
  SetUrl,
} from "./newAction.js";

function buildRoot() {
  const root = new ItemNode();
  root.layout = layoutRepo.get("map");
  return root;
}

beforeEach(() => {
  history.reset();
  setCurrentItem(null);
});

describe("newAction.js's action() helper", () => {
  it("pushes to history.js's shared undo stack, then runs do()", () => {
    const log = [];
    action({
      do() {
        log.push("do");
      },
      undo() {
        log.push("undo");
      },
    });

    expect(log).toEqual(["do"]);
    expect(history.canBack()).toBe(true);
  });
});

describe("InsertNewItem against ItemNode", () => {
  it("inserts the item and selects it via itemSelection.js, not app.selectItem", () => {
    const root = buildRoot();
    const insert = new InsertNewItem(root, 0);

    insert.do();

    expect(root.children).toContain(insert.item);
    expect(currentItem()).toBe(insert.item);
    expect(insert.item.side).toBe("right"); // pickBalancedSide default
  });

  it("undo removes the item and selects the parent", () => {
    const root = buildRoot();
    const insert = new InsertNewItem(root, 0);
    insert.do();

    insert.undo();

    expect(root.children).not.toContain(insert.item);
    expect(currentItem()).toBe(root);
  });

  it("inherits the single existing sibling's explicit shape (reuses action.js's pickInheritedShape)", () => {
    const root = buildRoot();
    const first = new ItemNode();
    first.shape = { id: "box" };
    root.insertChild(first);

    const insert = new InsertNewItem(root, root.children.length);

    expect(insert.item.shape).toBe(first.shape);
  });
});

describe("AppendItem/RemoveItem/MoveItem against ItemNode", () => {
  it("AppendItem inserts a pre-built item and selects it", () => {
    const root = buildRoot();
    const item = new ItemNode();
    const append = new AppendItem(root, item);

    append.do();

    expect(root.children).toContain(item);
    expect(currentItem()).toBe(item);
  });

  it("RemoveItem do()/undo() round-trips the tree position", () => {
    const root = buildRoot();
    const item = new ItemNode();
    root.insertChild(item);
    const remove = new RemoveItem(item);

    remove.do();
    expect(root.children).not.toContain(item);
    expect(currentItem()).toBe(root);

    remove.undo();
    expect(root.children).toContain(item);
    expect(currentItem()).toBe(item);
  });

  it("MoveItem do()/undo() round-trips parent, index, and side", () => {
    const root = buildRoot();
    const oldParent = new ItemNode();
    const newParent = new ItemNode();
    root.insertChild(oldParent);
    root.insertChild(newParent);
    const item = new ItemNode();
    item.side = "left";
    oldParent.insertChild(item);

    const move = new MoveItem(item, newParent, 0, "right");
    move.do();
    expect(newParent.children).toContain(item);
    expect(item.side).toBe("right");

    move.undo();
    expect(oldParent.children).toContain(item);
    expect(item.side).toBe("left");
  });
});

describe("Swap against ItemNode", () => {
  it("swaps a sibling's position via resolvedLayout.pickSibling", () => {
    const root = buildRoot();
    const a = new ItemNode();
    a.side = "right";
    const b = new ItemNode();
    b.side = "right";
    root.insertChild(a);
    root.insertChild(b);

    const swap = new Swap(a, 1);
    swap.do();

    expect(root.children.indexOf(a)).toBe(1);

    swap.undo();
    expect(root.children.indexOf(a)).toBe(0);
  });
});

// Phase 1 of docs/08-phase6-mindmap-engine-refactor.md folded these
// plain property-mutator actions directly into newAction.js (they used
// to be re-exported from the now-deleted action.js) -- these round-trip
// checks are the counterpart of the old action.item.test.js's coverage
// for the same classes, now run against ItemNode instead of item.js's
// Item.
describe("plain property-mutator actions", () => {
  it("SetText/SetColor do()/undo() round-trip on ItemNode", () => {
    const item = new ItemNode();

    const setText = new SetText(item, "hello");
    setText.do();
    expect(item.text).toBe("hello");
    setText.undo();
    expect(item.text).toBe("");

    const setColor = new SetColor(item, "#d33");
    setColor.do();
    expect(item.color).toBe("#d33");
    setColor.undo();
    expect(item.color).toBe("");
  });

  it("SetStatus do()/undo() round-trips the signal and its resolved memo", () => {
    const item = new ItemNode();
    const setStatus = new SetStatus(item, true);
    setStatus.do();
    expect(item.status).toBe(true);
    expect(item.resolvedStatus).toBe(true);
    setStatus.undo();
    expect(item.status).toBe(null);
    expect(item.resolvedStatus).toBe(null);
  });

  it("SetValue do()/undo() round-trips the signal and its resolved memo", () => {
    const item = new ItemNode();
    const setValue = new SetValue(item, 5);
    setValue.do();
    expect(item.value).toBe(5);
    expect(item.resolvedValue).toBe(5);
    setValue.undo();
    expect(item.value).toBe(null);
  });

  it("SetUrl do()/undo() round-trips the signal", () => {
    const item = new ItemNode();
    const setUrl = new SetUrl(item, "https://example.com");
    setUrl.do();
    expect(item.url).toBe("https://example.com");
    setUrl.undo();
    expect(item.url).toBe("");
  });
});
