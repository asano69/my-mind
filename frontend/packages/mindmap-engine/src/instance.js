// instance.js — createMindMap(): bundles the mindmap engine's
// already-factory-ready modules (history/itemSelection/viewport/
// navigation/actions/edit/clipboard/mouse) into one object per
// instance.
//
// Per docs/mind-map-core-engine-library/01-plan.md's Step 5, this is
// the "instance.js で createHistory/createItemSelection/... を束ねる
// createMindMap()" piece. createClipboardController()/
// createMouseController() (newClipboard.js/newMouse.js) are now
// parameterized the same way createActions()/createEdit() already
// were, so the clipboard/mouse controllers built here dispatch against
// this instance's own selection/history/actions instead of the
// module-level default singletons.
//
// Deliberately NOT wired here: newKeyboard.js and engineCommands.js
// still import itemSelection.js/newAction.js/newEdit.js/history.js's
// default singleton bindings directly, and every controller (including
// the clipboard/mouse ones built below) still shares one global
// "which instance currently owns input" flag via scope.js's
// isCanvasActive() -- see docs/mind-map-core-engine-library/01-plan.md's
// own note on a future per-instance scope broker. Parameterizing
// newKeyboard.js the same way is the natural next step and is left for
// a follow-up, rather than folded into this change.
import { createHistory } from "./history.js";
import { createItemSelection } from "./itemSelection.js";
import { createViewport } from "./newViewport.js";
import {
  createActions,
  SetText,
  SetSide,
  SetStatus,
  Swap,
  Multi,
} from "./newAction.js";
import { createEdit } from "./newEdit.js";
import { createNavigation } from "./navigation.js";
import { createClipboardController } from "./newClipboard.js";
import { createMouseController } from "./newMouse.js";
import { createEngineCommands } from "./engineCommands.js";
import { createKeyboardController } from "./newKeyboard.js";

export function createMindMap() {
  const history = createHistory();
  const selection = createItemSelection();
  const viewport = createViewport();
  const navigation = createNavigation();

  const actions = createActions(history, selection.selectItem);
  const edit = createEdit({
    action: actions.action,
    InsertNewItem: actions.InsertNewItem,
    // SetText is a plain, state-independent mutator class (see
    // newAction.js) -- not part of createActions()'s own return value,
    // so it's imported directly rather than read off `actions`.
    SetText,
    selectItem: selection.selectItem,
    historyInstance: history,
  });

  // MoveItem/AppendItem come from THIS instance's own `actions` (see
  // createActions() above), not from newAction.js's module-level
  // default export -- createActions() closes MoveItem/AppendItem's
  // do()/undo() over the `selectItem` it was given, so using the
  // module-level default here would silently select against the wrong
  // (default-singleton) selection state. Multi has no such binding (it
  // never touches selectItem itself), so it's imported directly, same
  // as SetText above.
  const clipboard = createClipboardController({
    currentItem: selection.currentItem,
    selectedItems: selection.selectedItems,
    editing: selection.editing,
    action: actions.action,
    MoveItem: actions.MoveItem,
    AppendItem: actions.AppendItem,
    Multi,
  });
  const mouse = createMouseController({
    currentItem: selection.currentItem,
    selectedItems: selection.selectedItems,
    selectItem: selection.selectItem,
    addToSelection: selection.addToSelection,
    editing: selection.editing,
    setEditing: selection.setEditing,
    startEditing: edit.startEditing,
    commitEditing: edit.commitEditing,
    action: actions.action,
    MoveItem: actions.MoveItem,
    Multi,
    navigateTo: navigation.navigateTo,
    viewport,
  });

  // engine-only command repo (formatting, tree edits, undo/redo,
  // viewport, per-item metadata) -- see engineCommands.js's own header
  // comment. Built from this instance's own selection/edit/actions/
  // history/viewport rather than any module-level default singleton.
  const commands = createEngineCommands({
    currentItem: selection.currentItem,
    editing: selection.editing,
    setEditing: selection.setEditing,
    selectedItems: selection.selectedItems,
    startEditing: edit.startEditing,
    commitEditing: edit.commitEditing,
    action: actions.action,
    InsertNewItem: actions.InsertNewItem,
    RemoveItem: actions.RemoveItem,
    Swap,
    SetSide,
    SetText,
    SetStatus,
    Multi,
    history,
    viewport,
  });

  // Keyboard shortcuts, wired to this instance's own selection/edit/
  // actions/history and to this instance's own engine command repo
  // (`commands.repo`) rather than the module-level default singletons
  // -- see newKeyboard.js's own header comment. This closes the last
  // gap noted in docs/mind-map-core-engine-library/01-plan.md's Step 5:
  // keyboard shortcuts now work correctly for any createMindMap()
  // instance, not only the first one created on the page.
  const keyboard = createKeyboardController({
    currentItem: selection.currentItem,
    selectedItems: selection.selectedItems,
    selectionCursor: selection.selectionCursor,
    selectItem: selection.selectItem,
    extendSelection: selection.extendSelection,
    editing: selection.editing,
    setEditing: selection.setEditing,
    startEditing: edit.startEditing,
    commitEditing: edit.commitEditing,
    discardEditing: edit.discardEditing,
    history,
    action: actions.action,
    InsertNewItem: actions.InsertNewItem,
    RemoveItem: actions.RemoveItem,
    Multi,
    sharedCommandRepo: commands.repo,
    setPanKeyboardScope: commands.setPanKeyboardScope,
    disposePan: commands.disposePan,
  });

  return {
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
  };
}
