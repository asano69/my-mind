import { describe, it, expect } from "vitest";
import { createMindMap } from "./instance.js";
import { createHistory } from "./history.js";

// Regression coverage for docs/mind-map-core-engine-library/01-plan.md's
// Step 5: createMindMap() bundles the already-factory-ready modules
// into one object. The property worth pinning down is independence --
// two instances must never share state, unlike each module's own
// default singleton export (see history.js/itemSelection.js/etc.'s own
// "Default singleton instance" comments).
describe("createMindMap", () => {
  it("returns independent sub-instances that share no state across two calls", () => {
    const a = createMindMap();
    const b = createMindMap();

    a.selection.setCurrentItem({ id: "a-item" });
    expect(b.selection.currentItem()).toBeNull();

    a.history.push({
      do() {},
      undo() {},
    });
    expect(a.history.canBack()).toBe(true);
    expect(b.history.canBack()).toBe(false);
  });

  it("wires actions/edit to this instance's own history and selection, not an unrelated instance's", async () => {
    // Same side-effect-registering imports every other newAction.js
    // test uses, so insertChild()/resolvedLayout resolve real
    // shape/layout instances.
    await import("./shape/box.js");
    await import("./shape/ellipse.js");
    await import("./shape/underline.js");
    await import("./layout/graph.js");
    await import("./layout/tree.js");
    await import("./layout/map.js");
    const { default: ItemNode } = await import("./itemStore.js");
    const { repo: layoutRepo } = await import("./layout/layout.js");
    // history.js has no module-level default singleton (see
    // docs/mind-map-core-engine-library/01-plan.md's Step 5) -- an
    // independent instance stands in for "some other history" here.
    const otherHistory = createHistory();

    const { history, selection, actions } = createMindMap();

    const root = new ItemNode();
    root.layout = layoutRepo.get("map");

    const insert = new actions.InsertNewItem(root, 0);
    actions.action(insert);

    expect(root.children).toContain(insert.item);
    expect(selection.currentItem()).toBe(insert.item);
    expect(history.canBack()).toBe(true);
    // The action was pushed to this instance's own history, not the
    // unrelated instance's.
    expect(otherHistory.canBack()).toBe(false);
  });

  it("gives each instance its own clipboard and mouse controllers", () => {
    const a = createMindMap();
    const b = createMindMap();

    expect(a.clipboard).not.toBe(b.clipboard);
    expect(a.mouse).not.toBe(b.mouse);
    expect(typeof a.clipboard.init).toBe("function");
    expect(typeof a.mouse.init).toBe("function");
  });
});
