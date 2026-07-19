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

// Which pane is the active workspace mode: the mind-map canvas or the
// notes editor. Added ahead of Workspace.jsx keeping both mounted at
// once and switching which one is on top (see
// docs/workspace-mode-switch-refactor.md, Phase 1) — engine-only
// listeners (keyboard/mouse/clipboard/resize) will gate on this in
// later phases so they don't fire while backgrounded.
export const [activeMode, setActiveMode] = createSignal("canvas");

// Toggles between the canvas and the notes editor as the active
// workspace mode. See docs/notes-background-editor-refactor-milkdown.md,
// Phase 1 — currently called alongside the existing ui/notes.js
// toggle()/close() pane-hidden logic, not yet unified with it.
export function toggleNotesMode() {
  setActiveMode((m) => (m === "notes" ? "canvas" : "notes"));
}

// PocketBase record id of the currently open map, mirrored from
// ui/io.js's setCurrentMap() so components (e.g. SnapshotsList.jsx) can
// react to which map is open without importing io.js directly.
export const [currentMapId, setCurrentMapId] = createSignal(null);

// Whether the left sidebar is currently showing the snapshot recovery
// list instead of its default reserved content area. Set by the
// "recover" command (see command/command.js), read by LeftPanel.jsx.
export const [showSnapshots, setShowSnapshotsRaw] = createSignal(false);
// Whether the left sidebar is currently showing the inline "browse all
// maps" list instead of its default reserved content area. Set by the
// "catalog-list" command (see command/command.js), read by
// LeftPanel.jsx/CatalogList.jsx.
export const [showCatalogList, setShowCatalogListRaw] = createSignal(false);

// Whether the help panel (#help) is hidden. Replaces the old help.js
// bridge module (registerToggle/dispose) now that command.js and
// HelpPanel.jsx are both plain consumers of a shared signal, same
// pattern as leftPanelHidden/rightPanelHidden.
export const [helpHidden, setHelpHiddenRaw] = createSignal(true);

// Help, the snapshot recovery list, and the maps browser act as
// mutually exclusive tabs in the left sidebar's content area: opening
// one always closes the others, and opening the one that's already
// open is a no-op rather than a toggle-away (unlike
// leftPanelHidden/rightPanelHidden, which really are simple show/hide
// toggles).
export function openHelp() {
  setShowSnapshotsRaw(false);
  setShowCatalogListRaw(false);
  setHelpHiddenRaw(false);
}
export function closeHelp() {
  setHelpHiddenRaw(true);
}
export function openSnapshots() {
  setHelpHiddenRaw(true);
  setShowCatalogListRaw(false);
  setShowSnapshotsRaw(true);
}
export function openCatalogList() {
  setHelpHiddenRaw(true);
  setShowSnapshotsRaw(false);
  setShowCatalogListRaw(true);
}
