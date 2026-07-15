import { describe, it, expect } from "vitest";
import * as pubsub from "./pubsub.js";

// Regression test for the "my-mind.js アンマウント安全化" migration
// (see CLAUDE.md). Several modules under lib/mindmap subscribe to pubsub
// from inside their init() using a fresh closure every call (e.g. title.js's
// `pubsub.subscribe("title-change", (_message, title) => {...})`). Since
// there is currently no way to unsubscribe those closures on unmount, a
// remount piles up a second subscription and a single publish ends up
// handled twice.
//
// The planned fix (Phase 1) is a pubsub.reset() that a future unmount()
// calls before every remount. This test simulates that mount/unmount cycle
// and currently fails because reset() does not exist yet.
describe("pubsub reset (mount/unmount safety)", () => {
  it("clears all subscribers so a remounted module does not double-fire", () => {
    const MESSAGE = "title-change";
    let callCount = 0;

    // Mirrors title.js's init(): subscribes a fresh closure each time.
    function mount() {
      pubsub.subscribe(MESSAGE, () => callCount++);
    }

    // Mirrors the unmount step the migration plan will introduce.
    function unmount() {
      pubsub.reset();
    }

    mount();
    unmount();
    mount(); // remount, as MindMapCanvas.jsx does after navigating back

    pubsub.publish(MESSAGE);

    expect(callCount).toBe(1);
  });
});
