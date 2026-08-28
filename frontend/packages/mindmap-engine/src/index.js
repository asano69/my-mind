// index.js — the mindmap-engine package's public API surface.
//
// Per docs/mind-map-core-engine-library/01-plan.md's Phase 4, this
// barrel re-exports exactly the symbols the host app (frontend/src)
// currently imports via deep paths like "mindmap-engine/scope.js".
// Nothing is moved or renamed at the implementation level -- every
// export below is a straight passthrough to its existing module. Once
// the app's own import sites switch from deep paths to this barrel,
// future internal file moves inside src/ won't ripple out to the app
// anymore, since the app will only ever depend on this one file's
// shape.
//
// Two export styles are used, matching how the app already consumes
// each module:
//   - Flat named exports for symbols that are unique across modules
//     (no other module here exports the same name).
//   - Namespace exports (export * as X) for modules the app already
//     imports as `import * as X from "mindmap-engine/X.js"` -- mainly
//     newMouse/newKeyboard/newClipboard/newViewport, whose init()/
//     dispose() names collide with each other and can't be flattened.

// -- itemSelection.js --
export {
  currentItem,
  setCurrentItem,
  selectedItems,
  setSelectedItems,
  selectionCursor,
  setSelectionCursor,
  editing,
  setEditing,
  clearMultiSelection,
  extendSelection,
  selectItem,
  addToSelection,
  isCurrent,
  isSelected,
  itemStateClassList,
} from "./itemSelection.js";

// -- itemStore.js --
export { default as ItemNode, measureContentSize } from "./itemStore.js";

// -- newAction.js --
export {
  action,
  InsertNewItem,
  AppendItem,
  RemoveItem,
  MoveItem,
  Swap,
  SetText,
  SetValue,
  SetStatus,
  SetColor,
  SetTextColor,
  SetIcon,
  SetUrl,
  SetSide,
  SetLayout,
  SetShape,
} from "./newAction.js";

// -- scope.js --
export {
  useScope,
  useScopeWhen,
  setBaseScope,
  topScope,
  isScopeActive,
  isCanvasActive,
} from "./scope.js";

// -- history.js --
export { historyVersion, reset, push, back, forward, canBack, canForward } from "./history.js";

// -- navigation.js --
export { registerNavigate, navigateTo } from "./navigation.js";

// -- instance.js: createMindMap() bundles the already-factory-ready
// modules (history/itemSelection/viewport/navigation/actions/edit/
// clipboard/mouse) into one object per instance, per
// docs/mind-map-core-engine-library/01-plan.md's Step 5. See
// instance.js's own header comment for what is and isn't wired up yet
// (newKeyboard.js/engineCommands.js are not). --
export { createMindMap } from "./instance.js";

// -- newEdit.js --
export { registerDomRefs } from "./newEdit.js";

// -- layout/constants.js --
export { TOGGLE_SIZE, D_MINUS, D_PLUS } from "./layout/constants.js";

// -- layout/layout.js / shape/shape.js / engineCommands.js: each
// exports its own `repo` Map, so these are aliased on the way out to
// avoid colliding with one another (the app already aliases these the
// same way at its own call sites, e.g. `import { repo as layoutRepo }
// from "mindmap-engine/layout/layout.js"`). --
export { repo as layoutRepo } from "./layout/layout.js";
export { repo as shapeRepo } from "./shape/shape.js";
export {
  repo as engineCommandRepo,
  setPanKeyboardScope,
  disposePan,
} from "./engineCommands.js";

// -- shape/box.js, shape/ellipse.js, shape/underline.js: named
// pure-style helpers. Importing them here also runs each module's own
// registration side effect (new Box()/new Ellipse()/new Underline()),
// same as the app's existing direct imports rely on. --
export { computeBoxStyle } from "./shape/box.js";
export { computeEllipseStyle } from "./shape/ellipse.js";
export { computeUnderlinePath } from "./shape/underline.js";

// -- newMouse.js: handleItemClick/handleItemDblClick/handleItemLinkClick/
// handleContextMenu are unique names and can be flattened; init/dispose
// collide with newKeyboard.js/newClipboard.js/newViewport.js's own
// init/dispose, so the whole module is also exported as a namespace for
// callers that need those. --
export {
  handleItemClick,
  handleItemDblClick,
  handleItemLinkClick,
  handleContextMenu,
} from "./newMouse.js";
export * as newMouse from "./newMouse.js";
export * as newKeyboard from "./newKeyboard.js";
export * as newClipboard from "./newClipboard.js";
export * as newViewport from "./newViewport.js";

// -- layout/map.js: side-effect import only. Registers MapLayout (and,
// via its own import of graph.js, GraphLayout) into layout/layout.js's
// shared repo -- needed for layoutRepo.get("map") etc. to resolve. --
import "./layout/map.js";
