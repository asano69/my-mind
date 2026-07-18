import * as app from "../my-mind.js";
import { activeMode, bumpDirty, setActiveMode } from "../store.js";

// Set by NotesEditor's onMount (see components/NotesEditor.jsx) instead of
// the old iframe + postMessage protocol, since the editor now lives in the
// same document as this module.
let editorAPI = null;

export function registerEditorAPI(api) {
  editorAPI = api;
}

export function toggle() {
  const nextMode = activeMode() === "notes" ? "canvas" : "notes";
  setActiveMode(nextMode);
  if (nextMode === "notes" && app.currentItem) {
    editorAPI?.setContent(app.currentItem.notes);
  }
}

export function close() {
  setActiveMode("canvas");
}

export function onItemSelect(item) {
  if (!item) {
    return;
  }
  editorAPI?.setContent(item.notes);
}

// Called by NotesEditor whenever the user edits the text.
export function onEditorChange(text) {
  if (!app.currentItem) {
    return;
  }
  app.currentItem.notes = text.trim();

  // Explicit call kept even though map.js's shared layout computed
  // already reruns (and bumps dirtyVersion itself) whenever any item's
  // notes signal changes — relying on that cross-module dependency
  // alone would make this file's connection to auto-save invisible to
  // someone reading only this file.
  bumpDirty();
}

// docs/workspace-mode-switch-refactor.md, Phase 4) — `onItemSelect`/
// `registerEditorAPI` assume there is exactly one notes pane. Safe under
// the current "one canvas, toggle visibility" model; revisit if multiple
// canvases are ever mounted simultaneously.
//
// No DOM setup needed here anymore: the old #note-preview watermark
// element is gone (see docs/03.2-workspace-mode-switch-refactor.md,
// Phase 5) — the background/readonly tone is now handled by CSS on the
// Milkdown root itself (see NotesEditor.css), since Milkdown always
// live-renders and no longer needs a separate preview element.
export function init() {}
// Called by my-mind.js's unmount().
export function dispose() {
  editorAPI = null;
}
