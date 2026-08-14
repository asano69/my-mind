// layout/constants.js — shared visual constants for the collapse/expand
// toggle glyph. Extracted out of item.js so modules that only need this
// glyph geometry (layout/tree.js, NewMindMapPreview.jsx) don't have to
// import the old engine's item.js just for it (see
// docs/09-final-migration-to-new-engine.md, Phase 2). item.js itself
// re-exports TOGGLE_SIZE from here rather than redefining it, so the
// two engines can never drift on this value.
export const TOGGLE_SIZE = 7;
export const D_MINUS = `M ${-(TOGGLE_SIZE - 2)} 0 L ${TOGGLE_SIZE - 2} 0`;
export const D_PLUS = `${D_MINUS} M 0 ${-(TOGGLE_SIZE - 2)} L 0 ${TOGGLE_SIZE - 2}`;
