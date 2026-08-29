// previewHelpers.js — pure, DOM/JSX-free helpers shared by
// NewMindMapPreview.jsx and its tests. Split out so importing these
// functions (e.g. from NewMindMapPreview.test.jsx) never pulls in
// lucide-solid or any other JSX-only dependency -- NewMindMapPreview.jsx
// imports lucide-solid's Paperclip icon for rendering, which requires a
// real (or jsdom-like) browser environment and crashes the moment it's
// imported under vitest's plain "node" environment (see
// vitest.config.js), even when the icon itself is never rendered.
import {
  ItemNode,
  layoutRepo,
  shapeRepo,
  measureContentSize,
} from "mindmap-engine";

export { measureContentSize };

// Single place both layoutResult()'s computation (see itemStore.js) and
// the JSX recursion in NewMindMapPreview.jsx read to decide which
// children are part of the visible tree -- mirrors item.js's
// `!item.collapsed && item.children.forEach(...)` guard, kept here
// rather than inlined so the "what counts as visible" definition can't
// drift between the two.
export function visiblePreviewChildren(item) {
  return item.collapsed ? [] : item.childItems;
}

// Indirect DOM reference registry: Map<item.id, HTMLElement>. Lets a
// vanilla module (mouse.js's drag math, clipboard.js's cut-visual
// toggling) locate an item's rendered content element without touching
// item.dom directly, since ItemNode (the Phase 1 data store) never
// holds a DOM reference itself. Kept as two tiny pure functions so
// registration/cleanup can be unit-tested without rendering an actual
// Solid component tree.
export function registerDomRef(domRefs, item, el) {
  domRefs.set(item.id, el);
}
export function unregisterDomRef(domRefs, item) {
  domRefs.delete(item.id);
}

// Extracts the connector layout's togglePosition, shared by every
// layout kind (graph/tree/map, see layout/*.js's writeConnectorPaths).
// A collapsed item's connector descriptors carry only togglePosition
// (no `d`), so this still resolves correctly while collapsed -- the
// toggle glyph must stay addressable so the node can be re-expanded.
export function togglePositionFor(connectorPaths) {
  const withToggle = connectorPaths.find((path) => path.togglePosition);
  return withToggle ? withToggle.togglePosition : null;
}

// Creates a fresh, empty map: just a root node labeled with `title`
// (today's date, see Workspace.jsx's uuid-less case). No demo children --
// those were only ever meant for local development and were leaking into
// every real new map.
export function createPreviewRoot(title) {
  const root = new ItemNode();
  root.text = title;
  root.layout = layoutRepo.get("map");
  root.shape = shapeRepo.get("ellipse");
  return root;
}

export function rootFromMapData(data) {
  const rootData = data?.root;
  if (!rootData) {
    return null;
  }
  return ItemNode.fromJSON(rootData);
}
