// Manages the map's title — the value stored in PocketBase's "title"
// field — independently of the mindmap's root node text (map.name).
import { createRoot, createEffect } from "solid-js";
import { currentTitle } from "./store.js";
import * as io from "./ui/io.js";

// Set by TitleBar's onMount (see components/TitleBar.jsx), mirroring the
// registerEditorAPI() pattern used by ui/notes.js.
let inputAPI = null;

// Disposes the createEffect below, set by init(). Solid effects created
// outside a component need an explicit root/dispose pair (createRoot) so
// they can be torn down on unmount().
let disposeEffect = null;

export function registerInput(api) {
  inputAPI = api;
  api.setValue(currentTitle());
}

export function rename(text) {
  io.setTitle(text.trim());
}

// Keeps the browser tab title and the TitleBar input in sync with
// store.js's currentTitle signal. Replaces the old "title-change" pubsub
// subscription (see CLAUDE.md, Solid migration Phase 4).
export function init() {
  createRoot((dispose) => {
    disposeEffect = dispose;
    createEffect(() => {
      const title = currentTitle();
      document.title = title || "Untitled";
      inputAPI?.setValue(title);
    });
  });
}

// Called by my-mind.js's unmount(). Disposes the effect started by init(),
// drops the reference to the (now-unmounted) TitleBar's API, and resets the
// browser tab title. Without this, navigating back to the catalog via SPA
// routing (no full page reload) would leave the last opened map's title
// showing in the tab.
export function dispose() {
  disposeEffect?.();
  disposeEffect = null;
  document.title = "my-mind";
  inputAPI = null;
}
