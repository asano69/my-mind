// Manages the map's title — the value stored in PocketBase's "title"
// field — independently of the mindmap's root node text (map.name).
import * as pubsub from "./pubsub.js";
import * as io from "./ui/io.js";

// Set by TitleBar's onMount (see components/TitleBar.jsx), mirroring the
// registerEditorAPI() pattern used by ui/notes.js.
let inputAPI = null;

export function registerInput(api) {
  inputAPI = api;
  api.setValue(io.getTitle());
}

export function rename(text) {
  io.setTitle(text.trim());
}

export function init() {
  pubsub.subscribe("title-change", (_message, title) => {
    document.title = title || "Untitled";
    inputAPI?.setValue(title);
  });
}

// Called by my-mind.js's unmount(). The "title-change" subscription itself
// is torn down by unmount()'s later pubsub.reset() call, so this only
// needs to drop the reference to the (now-unmounted) TitleBar's API and
// reset the browser tab title. Without this, navigating back to the
// catalog via SPA routing (no full page reload) would leave the last
// opened map's title showing in the tab.
export function dispose() {
  document.title = "my-mind";
  inputAPI = null;
}
