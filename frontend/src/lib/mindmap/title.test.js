import { describe, it, expect, beforeEach, vi } from "vitest";

// io.js is mocked out so importing title.js doesn't pull in the whole
// engine (my-mind.js, map.js, backend/pocketbase.js, ...) -- title.js
// only calls io.setTitle() from rename(), which this test never exercises.
vi.mock("./ui/io.js", () => ({ setTitle: vi.fn() }));
// Use the synchronous dist build (same workaround as item.test.js) so
// createEffect's first run and every subsequent update happen on the
// same tick as the signal write below. The default "solid-js" export
// schedules effect (re-)runs on a microtask, which this test's
// synchronous assertions can't observe.
vi.mock("solid-js", async () => await import("solid-js/dist/solid.js"));

import { setCurrentTitle } from "./store.js";

// Regression test for the title bar getting stuck on "Untitled" after
// clearing a manual title. TopBar.jsx used to receive title updates
// through an imperative registerInput()/inputAPI push bridge instead of
// reading store.js's currentTitle() directly, so the displayed value
// could lag behind an already-correct currentTitle() update. That bridge
// is gone now -- document.title (the only thing title.js still owns
// besides rename()) is driven straight off currentTitle(), so there is
// no separate mirrored value that can go stale.
const title = await import("./title.js");

describe("title.js", () => {
  beforeEach(() => {
    globalThis.document = { title: "" };
    setCurrentTitle("");
  });

  it("no longer exposes the old registerInput/unregisterInput bridge", () => {
    expect(title.registerInput).toBeUndefined();
    expect(title.unregisterInput).toBeUndefined();
  });

  it("syncs document.title directly from currentTitle(), including the fallback-to-root-name case", () => {
    title.init();
    setCurrentTitle("My Map");
    expect(document.title).toBe("My Map");

    // Simulates io.setTitle("")'s own setCurrentTitle(autoTitle) call
    // when a manually-set title is cleared and falls back to the root
    // node's current label.
    setCurrentTitle("Root Node Label");
    expect(document.title).toBe("Root Node Label");

    title.dispose();
  });

  it("falls back to 'Untitled' only when currentTitle() is actually empty", () => {
    title.init();
    setCurrentTitle("");
    expect(document.title).toBe("Untitled");
    title.dispose();
  });

  it("dispose() resets document.title", () => {
    title.init();
    setCurrentTitle("My Map");
    title.dispose();
    expect(document.title).toBe("my-mind");
  });
});
