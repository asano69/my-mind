import { setContextMenuPoint } from "../store.js";

// The right-click item menu no longer owns a DOM node. Opening/closing it
// is now just writing the click point into store.js's contextMenuPoint
// signal, which ContextMenu.jsx renders from directly. This replaces the
// old pattern of querying "#context-menu" by id, toggling its hidden
// attribute, and computing style.left/style.top by hand. It also removes
// the need for the old mousedown-based click handling and its
// capture-phase document listener (used only to swallow the browser's
// follow-up "click" so containerEl's delegated click listener in
// ui/ui.js wouldn't execute the same command twice) -- ContextMenu.jsx's
// buttons use on:click with stopPropagation() instead, which is enough
// on its own.
//
// Assumes a single instance in the DOM (see
// docs/workspace-mode-switch-refactor.md, Phase 4) -- safe under the
// current "one canvas, toggle visibility" model; revisit if multiple
// canvases are ever mounted simultaneously.
export function open(point) {
  setContextMenuPoint({ x: point[0], y: point[1] });
}

export function close() {
  setContextMenuPoint(null);
}

// Kept so ui/ui.js's existing init()/dispose() call sites don't need to
// change, even though there is no DOM setup/teardown left to do here --
// this just guards against a stale point from a previous mount leaking
// into a fresh one.
export function init() {
  close();
}

export function dispose() {
  close();
}
