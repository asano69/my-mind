// currentSelection.js — resolves the active engine's "currently
// selected item" signal. The old engine (my-mind.js's app.currentItem,
// mirrored in store.js) and the new engine (itemSelection.js)
// intentionally keep separate selection state until doc08 Phase 6
// deletes the old engine (see itemSelection.js's own header comment).
// Modules that must work under both engines (e.g. ui/notes.js) read
// currentItem() here instead of importing either signal directly.
import { currentItem as oldCurrentItem } from "./store.js";
import { currentItem as newCurrentItem } from "./itemSelection.js";
import { isNewEngineEnabled } from "./newEngineFlag.js";

const resolved = isNewEngineEnabled() ? newCurrentItem : oldCurrentItem;

export function currentItem() {
  return resolved();
}
