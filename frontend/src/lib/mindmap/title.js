// Manages the map's title — the value stored in PocketBase's "title"
// field — independently of the mindmap's root node text (map.name).
import { createRoot, createEffect } from "solid-js";
import { currentTitle } from "./store.js";
import * as io from "./ui/io.js";

// Disposes the createEffect below, set by init(). Solid effects created
// outside a component need an explicit root/dispose pair (createRoot) so
// they can be torn down on unmount().
let disposeEffect = null;

export function rename(text) {
  io.setTitle(text.trim());
}

// Keeps the browser tab title in sync with store.js's currentTitle
// signal. Replaces the old "title-change" pubsub subscription (see
// CLAUDE.md, Solid migration Phase 4). TopBar.jsx reads currentTitle()
// directly for its own display instead of being pushed a value here
// (see CLAUDE.md's Phase 5 addendum, "read-only consumption — no bridge
// object") — the old push-based mirror was a second, delayed copy of
// the same signal, and could leave the title bar stuck on "Untitled"
// for a beat after clearing the title, even though currentTitle() was
// already correct.
export function init() {
  createRoot((dispose) => {
    disposeEffect = dispose;
    createEffect(() => {
      document.title = currentTitle() || "Untitled";
    });
  });
}

// Called by my-mind.js's unmount(). Disposes the effect started by init()
// and resets the browser tab title. Without resetting document.title,
// navigating back to the catalog via SPA routing (no full page reload)
// would leave the last opened map's title showing in the tab.
export function dispose() {
  disposeEffect?.();
  disposeEffect = null;
  document.title = "solid-mind";
}
