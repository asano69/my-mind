// newEdit.js — text editing for the ?newEngine=1 preview (Phase 4.5 of
// docs/08-mindmap-engine-refactor.md).
//
// Ported from item.js's startEditing()/stopEditing()/handleEvent(): the
// contentEditable attribute is toggled imperatively only while actively
// editing, never bound declaratively via JSX -- Solid's reactive
// bindings and contentEditable + cursor-position preservation are a
// known-bad combination, so this intentionally stays outside Solid's
// reactivity (see the plan's own note on this).
//
// The text DOM node is located through a registered domRefs Map (Phase
// 4.1's indirect reference registry, see NewMindMapPreview.jsx), not
// item.dom -- ItemNode (the Phase 1 data store) never holds a DOM
// reference of its own. registerDomRefs() is the same "vanilla module
// needs to reach into Solid-owned refs" bridge pattern item.js's own
// registerNavigate() and notes.js's registerEditorAPI() already use.
import { isUrlOnly } from "./urlUtils.js";
import { measureContentSize } from "./itemStore.js";
import {
  action as defaultAction,
  InsertNewItem as DefaultInsertNewItem,
  SetText as DefaultSetText,
} from "./newAction.js";
import { selectItem as defaultSelectItem } from "./itemSelection.js";
import * as defaultHistory from "./history.js";

// createEdit() closes newEdit.js's per-instance state (domRefs,
// activeSession) into a factory, per docs/mind-map-core-engine-library/
// 01-plan.md's Step 5 -- `actions`/`selectItem`/`historyInstance` let a
// caller wire this to a non-default engine instance (see newAction.js's
// createActions()); every existing call site keeps using the module-
// level default instance further down.
export function createEdit({
  action = defaultAction,
  InsertNewItem = DefaultInsertNewItem,
  SetText = DefaultSetText,
  selectItem = defaultSelectItem,
  historyInstance = defaultHistory,
} = {}) {
  let domRefs = null;
  function registerDomRefs(refs) {
    domRefs = refs;
  }

  // Only one item can be edited at a time, mirroring the old engine's
  // single app.currentItem editing constraint.
  let activeSession = null; // { item, textEl, handleKeyDown, handlePaste }

  function textElementFor(item) {
    const content = domRefs?.get(item.id);
    return content ? content.querySelector(".text") : null;
  }

  function isEditing(item) {
    return !!activeSession && activeSession.item === item;
  }

  // Starts live editing of `item`'s text. Returns the text element on
  // success, or null if it has no registered DOM ref yet (e.g. called
  // before the item's own content has mounted).
  function startEditing(item) {
    const textEl = textElementFor(item);
    if (!textEl) {
      return null;
    }
    const handleKeyDown = (e) => {
      // TAB has a special meaning in this app (see item.js's own
      // handler); never let it move focus while editing.
      if (e.code === "Tab") {
        e.preventDefault();
      }
    };
    // Live remeasure while typing, mirroring item.js's own "input" case
    // (handleEvent()'s `this._bumpContentVersion()`). Without this, the
    // <foreignObject> stays at whatever size it had when editing started
    // -- since it's a real SVG viewport, growing text beyond that fixed
    // box gets clipped by the browser instead of just overflowing, making
    // newly typed characters invisible until something else (e.g.
    // commitEditing()) forces a remeasure.
    const handleInput = () => {
      const content = domRefs?.get(item.id);
      if (content) {
        item.setMeasuredSize(
          measureContentSize(content, item.defaultContentSize()),
        );
      }
    };
    // Same URL-only-paste detection as item.js's "paste" case: if the
    // pasted text ends up being the item's *entire* content, treat it as
    // a link instead of literal text. Pasting a URL into non-empty text
    // should NOT set the url field, hence the deferred textContent check
    // -- same reasoning as item.js's own handler.
    const handlePaste = (e) => {
      const pasted = e.clipboardData?.getData("text/plain") ?? "";
      if (!isUrlOnly(pasted)) {
        return;
      }
      const trimmed = pasted.trim();
      queueMicrotask(() => {
        if (textEl.textContent.trim() === trimmed) {
          item.url = trimmed;
        }
      });
    };

    textEl.contentEditable = "true";
    textEl.focus();
    document.execCommand?.("styleWithCSS", false, "false");
    textEl.addEventListener("keydown", handleKeyDown);
    textEl.addEventListener("paste", handlePaste);
    textEl.addEventListener("input", handleInput);

    activeSession = { item, textEl, handleKeyDown, handlePaste, handleInput };
    return textEl;
  }

  // Tears down the current editing session's DOM state (listeners,
  // contentEditable, focus) and returns its text element, or null if
  // `item` is not the item currently being edited.
  function teardown(item) {
    if (!isEditing(item)) {
      return null;
    }
    const { textEl, handleKeyDown, handlePaste, handleInput } = activeSession;
    textEl.removeEventListener("keydown", handleKeyDown);
    textEl.removeEventListener("paste", handlePaste);
    textEl.removeEventListener("input", handleInput);
    textEl.blur();
    textEl.contentEditable = "false";
    activeSession = null;
    return textEl;
  }

  // Ends editing and commits the typed text back into the store.
  function commitEditing(item) {
    const textEl = teardown(item);
    if (!textEl) {
      return;
    }
    const text = textEl.innerHTML;
    // A brand-new node (inserted by newKeyboard.js's Enter/Tab commands as
    // a draft, not yet pushed to history -- mirrors command/edit.js's
    // Finish command) needs special handling: with no content, discard it
    // directly instead of committing an empty node, so undo/redo never
    // sees a "create empty node" step. With real content, this is the
    // moment its creation is recorded as a single undo step.
    if (item.isNew) {
      const parent = item.parent;
      const index = parent.children.indexOf(item);
      if (!text) {
        parent.removeChild(item);
        selectItem(parent);
        return;
      }
      item.isNew = false;
      item.text = text;
      const numText = Number(text);
      // Root nodes never auto-set a numeric value.
      if (!item.isRoot && String(numText) == text) {
        item.value = numText;
      }
      // The item is already inserted and its content already set -- push
      // it to history without calling do() again (history.push() only
      // records the action, see history.js).
      historyInstance.push(new InsertNewItem(parent, index, item));
    } else {
      // Routed through history.js via newAction.js's action() (Phase 4.6
      // of docs/08-mindmap-engine-refactor.md) instead of a direct
      // `item.text = ` assignment, so a text edit becomes a real undo/redo
      // step -- SetText itself is action.js's unchanged implementation (a
      // plain property mutator, works against ItemNode the same way it
      // works against the old engine's Item, see newAction.js's own
      // comment).
      action(new SetText(item, text));
    }
    // Force an immediate remeasure using the already-painted DOM (the
    // browser laid out the edited text live, so this is accurate without
    // waiting for a reactive effect) -- see itemStore.js's setMeasuredSize
    // comment on why a signal write like this must never happen during
    // layoutResult's own computation, only from a follow-up like this one.
    const content = domRefs?.get(item.id);
    if (content) {
      item.setMeasuredSize(
        measureContentSize(content, item.defaultContentSize()),
      );
    }
  }

  // Ends editing without committing, restoring the DOM to the item's
  // last-committed text -- mirrors item.js's stopEditing(), which resets
  // dom.text.innerHTML to originalText before reading it.
  function discardEditing(item) {
    const textEl = teardown(item);
    if (!textEl) {
      return;
    }
    // Same draft-discard case as commitEditing()'s empty-input branch: a
    // brand-new node was never pushed to history, so removing it here
    // needs no undo step either -- mirrors command/edit.js's Cancel
    // command.
    if (item.isNew) {
      const parent = item.parent;
      parent.removeChild(item);
      selectItem(parent);
      return;
    }
    textEl.innerHTML = item.text;
  }

  return {
    registerDomRefs,
    isEditing,
    startEditing,
    commitEditing,
    discardEditing,
  };
}

// Default singleton instance, bound to newAction.js's/itemSelection.js's/
// history.js's own default singletons -- preserves every existing call
// site (newMouse.js, newKeyboard.js, engineCommands.js,
// NewMindMapPreview.jsx) unchanged during the migration. Once callers
// are threaded through an explicit instance instead, this default
// export can be dropped.
const defaultEdit = createEdit();
export const {
  registerDomRefs,
  isEditing,
  startEditing,
  commitEditing,
  discardEditing,
} = defaultEdit;
