// newIo.js — adapts the ?newEngine=1 preview's ItemNode tree to
// ui/io.js's save/autosave/delete/title bookkeeping (see
// docs/08-mindmap-engine-refactor.md). ui/io.js already owns everything
// that has nothing to do with which engine owns the tree (currentMapId/
// currentMapUuid tracking, the debounced auto-save effect, error
// handling, leave-confirmation); the only engine-specific pieces are
// "how to serialize the current tree" and "which SVG root to snapshot"
// -- this module supplies just those two through io.js's pluggable
// setTreeProvider()/setSvgNodeProvider() hooks instead of duplicating
// the save machinery itself.
import * as io from "./ui/io.js";
import ItemNode from "./itemStore.js";

// The most recently attached root/SVG node (see attach() below), kept
// here as plain module state -- not just inside the closures passed to
// io.js -- so callers outside the save/autosave path (e.g.
// RightPanelExportActions.jsx's copy/download-image buttons) can read
// the same SVG node/root without reaching into io.js's internal save
// machinery.
let currentRoot = null;
let currentSvgNode = null;

// Wraps an ItemNode root so it exposes the same toJSON()/name shape
// ui/io.js's performSave() expects from the old engine's Map instance.
function adapt(root) {
  return {
    toJSON: () => ({ root: root.toJSON() }),
    get name() {
      return root.name;
    },
  };
}

// Registers `root`/`svgNode` as the source io.js reads from for save/
// autosave/SVG snapshotting. Called whenever the preview's root
// ItemNode (re)loads -- see NewMindMapPreview.jsx.
export function attach(root, svgNode) {
  currentRoot = root;
  currentSvgNode = svgNode;
  io.setTreeProvider(() => adapt(root));
  io.setSvgNodeProvider(() => svgNode);
  io.setRestoreProvider(restoreSnapshot);
}

// Registered by NewMindMapPreview.jsx (see registerCenterSource() for
// the same "owning component registers, vanilla module reads" bridge
// pattern) so this module can swap in a freshly restored root without
// owning the preview's own state.
let rootLoader = null;
export function registerRootLoader(fn) {
  rootLoader = fn;
}

// io.js's restoreProvider for the new engine: rebuilds an ItemNode tree
// from a snapshot's saved JSON and hands it to whatever the preview
// registered via registerRootLoader(). Mirrors the old engine's
// restoreSnapshot() (app.showMap(MindMap.fromJSON(...))) -- map
// identity (currentMapId/currentMapUuid) is intentionally left
// untouched here, same as the old engine's version.
function restoreSnapshot(mymind) {
  rootLoader?.(ItemNode.fromJSON(mymind.root));
}

// The currently attached root ItemNode / SVG node, or null before the
// preview has loaded a map. Used by RightPanelExportActions.jsx's
// copy/download-image buttons to source backend/image.js's explicit
// svgNode/name parameters, instead of the old engine's app.currentMap
// (which is always null under the new engine).
export function getRoot() {
  return currentRoot;
}
export function getSvgNode() {
  return currentSvgNode;
}

// Restores the record bookkeeping (currentMapId/currentMapUuid/title)
// for an already-fetched map record, mirroring what the old engine's
// io.restore() applies internally via its own setCurrentMap() call --
// the new engine fetches the record itself (see NewMindMapPreview.jsx's
// loadPreviewRoot()), so this only needs to apply the bookkeeping, not
// re-fetch anything. Only call this for a map that was actually loaded
// from the server; a brand-new, never-saved map should leave io.js's
// currentMapId/currentMapUuid at their defaults instead (see the call
// site's own comment).
export function applyLoadedRecord(record) {
  io.setCurrentMap(record);
}

// Called on unmount so a stale provider can't outlive this preview
// instance (e.g. leaking into the next mount before it re-attaches).
export function detach() {
  currentRoot = null;
  currentSvgNode = null;
  io.setTreeProvider(null);
  io.setSvgNodeProvider(null);
  io.setRestoreProvider(null);
}
