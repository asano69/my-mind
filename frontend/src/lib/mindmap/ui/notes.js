import * as app from "../my-mind.js";
import { bumpDirty } from "../store.js";

let previewEl = null;
let previewInner = null;

// Set by NotesEditor's onMount (see components/NotesEditor.jsx) instead of
// the old iframe + postMessage protocol, since the editor now lives in the
// same document as this module.
let editorAPI = null;

export function registerEditorAPI(api) {
  editorAPI = api;
}

function updatePreview(notes) {
  const text = notes?.trim() ?? "";
  if (text && editorAPI) {
    previewInner.innerHTML = editorAPI.renderMarkdown(text);
    previewEl.hidden = false;
  } else {
    previewEl.hidden = true;
  }
}

export function toggle() {
  const node = document.querySelector("#notes");
  node.hidden = !node.hidden;
  if (!node.hidden && app.currentItem) {
    editorAPI?.setContent(app.currentItem.notes);
  }
}

export function close() {
  const node = document.querySelector("#notes");
  if (node.hidden) {
    return;
  }
  node.hidden = true;
}

export function onItemSelect(item) {
  if (!item) {
    return;
  }
  editorAPI?.setContent(item.notes);
  updatePreview(item.notes);
}

// Called by NotesEditor whenever the user edits the text.
export function onEditorChange(text) {
  if (!app.currentItem) {
    return;
  }
  app.currentItem.notes = text.trim();
  updatePreview(app.currentItem.notes);
  // Explicit call kept even though map.js's shared layout computed
  // already reruns (and bumps dirtyVersion itself) whenever any item's
  // notes signal changes — relying on that cross-module dependency
  // alone would make this file's connection to auto-save invisible to
  // someone reading only this file.
  bumpDirty();
}

// Assumes a single instance in the DOM (see
// docs/workspace-mode-switch-refactor.md, Phase 4) — `#note-preview`
// is created fresh here and `onItemSelect`/`registerEditorAPI` assume
// there is exactly one notes pane. Safe under the current "one canvas,
// toggle visibility" model; revisit if multiple canvases are ever
// mounted simultaneously.
export function init() {
  previewEl = document.createElement("div");
  previewEl.id = "note-preview";
  previewEl.hidden = true;
  previewEl.innerHTML = '<div id="note-preview-inner"></div>';
  document.querySelector("main").appendChild(previewEl);
  previewInner = previewEl.querySelector("#note-preview-inner");
}

// Called by my-mind.js's unmount(). Removes the watermark element this
// module injects directly into <main>, so a remount does not stack a
// second copy behind the fresh one.
export function dispose() {
  previewEl?.remove();
  previewEl = null;
  previewInner = null;
  editorAPI = null;
}
