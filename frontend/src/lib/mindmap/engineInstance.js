// engineInstance.js — this app's single mindmap-engine instance.
//
// mindmap-engine no longer exports a module-level default singleton for
// selection/history/viewport/navigation/actions/edit/clipboard/mouse
// (see docs/mind-map-core-engine-library/01-plan.md) -- createMindMap()
// is the library's only stateful entry point now. This app still opens
// one map at a time, so this file is the one place that calls
// createMindMap() and re-exports its pieces flat, matching the shape
// every existing call site in this app already expects. Every other
// app file should import these symbols from here, not from
// "mindmap-engine" directly -- when this app eventually supports more
// than one open map (tabs), only this file needs to change into a
// per-tab map instead of a single flat instance.
import {
  createMindMap,
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
} from "mindmap-engine";

const instance = createMindMap();

// The tree currently open in this instance -- see instance.js's own
// comment. Read directly (root()) or replaced wholesale (setRoot()/
// loadJSON()) by any app module that needs to; toJSON() mirrors
// loadJSON()'s input shape for saving.
export const { root, setRoot, loadJSON, toJSON } = instance;

export const {
  history,
  selection,
  viewport,
  navigation,
  actions,
  edit,
  clipboard,
  mouse,
  commands,
  keyboard,
} = instance;

export const {
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
} = selection;

export const {
  historyVersion,
  reset,
  push,
  back,
  forward,
  canBack,
  canForward,
} = history;

export const { navigate, setNavigate, navigateTo } = navigation;

export const {
  action,
  InsertNewItem,
  AppendItem,
  RemoveItem,
  MoveItem,
} = actions;

// SetText/SetValue/SetStatus/.../Swap are stateless action classes with
// no instance dependency (see newAction.js) -- they never moved into
// createMindMap()'s bundle, so they're just re-exported here (already
// imported above) rather than pulled off `actions`.
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
};

export const { registerDomRefs, startEditing, commitEditing, discardEditing } =
  edit;

// newMouse.js/newClipboard.js/newViewport.js/newKeyboard.js's
// init()/dispose() collide with each other, so these stay namespaced --
// mirrors index.js's old namespace-export rationale, just sourced from
// this instance's own controllers instead of the library's removed
// default singletons.
export const newMouse = mouse;
export const newClipboard = clipboard;
export const newViewport = viewport;
export const newKeyboard = keyboard;

// engineCommands.js's repo, plus Pan's keyboard-scope helpers, sourced
// from this instance's own `commands` controller instead of the
// library's removed default singleton -- newContextMenuCommands.js
// merges this repo with appCommands.js's app-only repo.
export const engineCommandRepo = commands.repo;
export const { setPanKeyboardScope, disposePan } = commands;

// Flattened out of newMouse for callers (NewMindMapPreview.jsx) that
// used to import these directly off mindmap-engine's old default
// singleton rather than going through the newMouse namespace.
export const { handleItemClick, handleItemDblClick, handleItemLinkClick } =
  mouse;

export default instance;
