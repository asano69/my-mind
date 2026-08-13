// New engine is now the default; ?oldEngine=1 opts back into the legacy
// item.js-based engine while it's being phased out (see docs/08-mindmap-
// engine-refactor.md). Every consumer of this flag (MindMapCanvas.jsx,
// RightPanelProperties.jsx, ValueDialog.jsx, ContextMenu.jsx,
// currentSelection.js) branches on this single function, so flipping the
// default here is sufficient without touching any call site.
export function isNewEngineEnabled(search = globalThis.location?.search ?? "") {
  return new URLSearchParams(search).get("oldEngine") !== "1";
}
