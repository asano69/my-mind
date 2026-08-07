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
    // Pass the item itself, not its text -- NotesEditor.jsx needs
    // item.id to look up (or create) that item's own CodeMirror Doc, so
    // each item keeps an independent undo/redo history.
    editorAPI?.setContent(app.currentItem);
  }
}

export function close() {
  setActiveMode("canvas");
}

export function onItemSelect(item) {
  if (!item) {
    return;
  }
  // See toggle()'s comment: setContent now takes the item, not text.
  editorAPI?.setContent(item);
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
// No init()/dispose() anymore: NotesEditor.jsx registers editorAPI once
// for the whole Workspace lifetime (it lives outside the canvas-scoped
// container, see Workspace.jsx), while this module used to be torn down
// on every canvas mount/unmount. That mismatch nulled out editorAPI the
// first time the canvas remounted (e.g. switching maps from the left
// panel's catalog list) and it was never registered again, silently
// breaking the background notes preview for every map after the first.
