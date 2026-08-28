// instance.js — createMindMap(): bundles the mindmap engine's
// already-factory-ready modules (history/itemSelection/viewport/
// navigation/actions/edit) into one object per instance.
//
// Per docs/mind-map-core-engine-library/01-plan.md's Step 5, this is
// the "instance.js で createHistory/createItemSelection/... を束ねる
// createMindMap()" piece that was still missing -- each of those
// modules already exposes a createXxx() factory (see their own "Step
// 5" comments), this file is the first thing that actually calls them
// together instead of only relying on each module's own default
// singleton.
//
// Deliberately NOT wired here: newClipboard.js's
// createClipboardController() and newMouse.js's createMouseController()
// (and, transitively, newKeyboard.js/engineCommands.js) still import
// itemSelection.js/newAction.js/newEdit.js/newViewport.js's default
// singleton bindings directly rather than accepting an instance as a
// parameter -- unlike createActions()/createEdit(), they were never
// parameterized in that way. So a MindMapInstance built here does NOT
// get its own independent clipboard/mouse/keyboard controller bound to
// its own tree; those three still operate against whichever instance
// is the module-level default. Parameterizing them the same way
// newAction.js/newEdit.js already are is the natural next step and is
// left for a follow-up, rather than folded into this change.
import { createHistory } from "./history.js";
import { createItemSelection } from "./itemSelection.js";
import { createViewport } from "./newViewport.js";
import { createActions, SetText } from "./newAction.js";
import { createEdit } from "./newEdit.js";
import { createNavigation } from "./navigation.js";

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

  return { history, selection, viewport, navigation, actions, edit };
}
