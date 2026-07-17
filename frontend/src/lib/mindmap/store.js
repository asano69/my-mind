import { createSignal } from "solid-js";

// Mirrors my-mind.js's `currentItem` module state as a Solid signal, so
// Solid components (see RightPanel.jsx) can react to selection changes
// without going through pubsub. Written by my-mind.js's selectItem() and
// unmount(); treat as read-only everywhere else.
export const [currentItem, setCurrentItem] = createSignal(null);

// The map's title (PocketBase's "title" field), owned by ui/io.js. Replaces
// the old "title-change" pubsub message (see CLAUDE.md, Solid migration
// Phase 4) — title.js and TitleBar.jsx read this directly instead of
// subscribing to an event.
export const [currentTitle, setCurrentTitle] = createSignal("");

// Timestamp (ms since epoch) of the last successful save, or null if the
// current map has not been saved yet. Replaces the old "save-done" pubsub
// message (see CLAUDE.md, Solid migration Phase 4) — ui/io.js and ui/ui.js
// both read this instead of maintaining their own copies.
export const [lastSaveTime, setLastSaveTime] = createSignal(null);

// Bumped once per full layout pass (map.js) or explicit notes edit
// (notes.js) to mean "something changed", for auto-save debouncing.
// Nothing reads the value itself, only its change — a plain counter,
// not a value carrying the changed item's identity like the old
// "item-change" pubsub message did. Replaces that message (see
// CLAUDE.md, Solid migration Phase 9.5).
export const [dirtyVersion, setDirtyVersion] = createSignal(0);
export function bumpDirty() {
  setDirtyVersion((v) => v + 1);
}

// Whether the left sidebar (#left-panel) is hidden. Mirrors the right
// sidebar's own hidden state (see RightPanel.jsx), but this one needs
// no bridge object: both reader (LeftPanel.jsx) and writer (TopBar.jsx)
// are plain Solid components, so a shared signal is enough (see
// CLAUDE.md's Phase 5 addendum, "read-only consumption — no bridge
// object").
export const [leftPanelHidden, setLeftPanelHidden] = createSignal(true);
export function toggleLeftPanel() {
  setLeftPanelHidden((h) => !h);
}

// Whether the right sidebar (#ui, the property panel) is hidden/ribbon-only.
// Mirrors leftPanelHidden exactly, now that RightPanel.jsx uses the same
// ribbon+expand layout as LeftPanel.jsx instead of the old slide-off-screen
// `.pane` behavior. No bridge object is needed: both reader (RightPanel.jsx)
// and writer (ui.js's toggle command) touch this signal directly.
export const [rightPanelHidden, setRightPanelHidden] = createSignal(false);
export function toggleRightPanel() {
  setRightPanelHidden((h) => !h);
}
