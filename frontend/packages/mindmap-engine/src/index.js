// index.js — the mindmap-engine package's public API surface.
//
// createMindMap() (see instance.js) is the library's ONE stateful entry
// point. Nothing in this file exports a module-level singleton anymore
// -- every symbol below is either a pure function/class (ItemNode,
// layoutRepo, shapeRepo, the shape/*.js style helpers) or genuinely
// page-global infrastructure (scope.js: the browser only ever has one
// document to attach a capture-phase clipboard listener to). A host
// that wants selection/history/viewport/actions/etc. must call
// createMindMap() itself and hold onto the returned instance -- see
// docs/mind-map-core-engine-library/01-plan.md's Step 5/Phase 4.
//
// Known exception: newKeyboard.js and engineCommandRepo (engineCommands.js)
// are NOT yet parameterized the way newMouse.js/newClipboard.js/newEdit.js
// are (see instance.js's own header comment) -- they still read
// itemSelection.js/newAction.js/history.js's own internal default
// singletons directly. They are kept as flat/namespace exports below
// until that parameterization work happens; a host embedding more than
// one mindmap will not get working keyboard shortcuts for more than one
// of them yet.

// -- itemStore.js --
export { default as ItemNode, measureContentSize } from "./itemStore.js";

// -- newAction.js: only the stateless pieces. Swap/SetText/SetValue/
// SetStatus/SetColor/SetTextColor/SetIcon/SetUrl/SetSide/SetLayout/
// SetShape are plain property-mutator classes with no instance
// dependency (they only ever touch a public ItemNode property setter --
// see newAction.js's own header comment), so they stay available
// directly from the library. The tree-mutation actions (InsertNewItem/
// AppendItem/RemoveItem/MoveItem) and action() itself DO depend on a
// specific history/selection pair (see createActions()) and are only
// available through a createMindMap() instance's `.actions`.
export {
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

// -- instance.js: the library's one stateful entry point. Bundles
// history/itemSelection/viewport/navigation/actions/edit/clipboard/
// mouse into a single independent object per call -- call this once per
// mindmap you want on the page. --
export { createMindMap } from "./instance.js";

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

// -- newKeyboard.js: see this file's header comment -- not yet
// instance-parameterized, so this is still the module's own internal
// default singleton, exported here as a stopgap. --
export * as newKeyboard from "./newKeyboard.js";

// -- layout/map.js: side-effect import only. Registers MapLayout (and,
// via its own import of graph.js, GraphLayout) into layout/layout.js's
// shared repo -- needed for layoutRepo.get("map") etc. to resolve. --
import "./layout/map.js";
