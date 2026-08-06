// src/command/edit.ts
import * as app from "../my-mind.js";
import * as actions from "../action.js";
import * as notes from "../ui/notes.js";
import * as mouse from "../mouse.js";
import { closeHelp, openValueDialog } from "../store.js";
import Command, { repo as commandRepo } from "./command.js";
new (class Edit extends Command {
  constructor() {
    super("edit", "Edit item");
    this.keys = [{ code: "Space" }, { code: "F2" }];
  }
  execute() {
    app.startEditing();
  }
})();
new (class Finish extends Command {
  constructor() {
    super("finish", "Finish editing");
    this.keys = [
      { code: "Enter", altKey: false, ctrlKey: false, shiftKey: false },
    ];
    this.editMode = true;
  }
  execute() {
    // Enter always confirms, even with empty text — matching typical
    // outliner behavior where pressing Enter repeatedly creates several
    // (initially empty) sibling nodes. Canceling an unwanted insertion is
    // Escape's job (see the Cancel command below), not Enter's.
    let text = app.stopEditing();
    let item = app.currentItem;
    // Exception: a brand-new node (inserted via InsertSibling/
    // InsertChild, see action.js's InsertNewItem) left empty on its
    // first confirm is discarded rather than committed as an empty
    // node. An existing node's text becoming empty is left untouched —
    // it may still carry notes — so this only ever applies to
    // just-inserted items (item.isNew).
    if (!text && item.isNew) {
      app.action(new actions.RemoveItem(item));
      return;
    }
    item.isNew = false;
    app.action(new actions.SetText(item, text));
  }
})();
new (class Newline extends Command {
  constructor() {
    super("newline", "Line break");
    this.keys = [
      { code: "Enter", shiftKey: true },
      { code: "Enter", ctrlKey: true },
    ];
    this.editMode = true;
  }
  execute() {
    let range = getSelection().getRangeAt(0);
    let br = document.createElement("br");
    range.insertNode(br);
    range.setStartAfter(br);
    // Only this item's own box grew (a line break was inserted), so bump
    // its content version instead of forcing a full-map recompute via
    // map.requestLayout() -- that used to invalidate every item's
    // layout memo on every Shift+Enter press.
    app.currentItem._bumpContentVersion();
  }
})();
new (class Cancel extends Command {
  constructor() {
    super("cancel", "Cancel");
    this.keys = [{ code: "Escape" }];
    this.editMode = null;
  }
  execute() {
    if (app.editing) {
      app.stopEditing();
      var oldText = app.currentItem.text;
      if (!oldText) {
        // newly added node
        var action = new actions.RemoveItem(app.currentItem);
        app.action(action);
      }
    } else if (mouse.isDragging()) {
      // A node drag is in progress: cancel it instead of closing panels.
      mouse.cancelDrag();
    } else {
      // Clear multi-selection before closing panels
      app.clearMultiSelection();
      notes.close();
      closeHelp();
    }
  }
})();
// ---------------------------------------------------------------------------
// Text style helpers
// ---------------------------------------------------------------------------
// All tag variants that each execCommand may produce across browsers.
// e.g. bold -> <b> in Chrome, <strong> in some older browsers.
// strikeThrough -> <s> or <strike> depending on browser.
const STYLE_TAGS = {
  bold: ["b", "strong"],
  italic: ["i", "em"],
  underline: ["u"],
  strikeThrough: ["s", "strike"],
};
// The canonical (first) tag used when adding the style
const STYLE_TAG_PRIMARY = {
  bold: "b",
  italic: "i",
  underline: "u",
  strikeThrough: "s",
};
/**
 * Toggle a style on an HTML string.
 * Accepts multiple tag aliases (e.g. ["s","strike"]) so that content
 * produced by any browser variant is recognised.
 *
 * If ANY of the alias tags appear anywhere in the HTML, ALL occurrences of
 * ALL aliases are stripped and the stripped string is returned.
 * Otherwise the whole content is wrapped in the primary (canonical) tag.
 */
function toggleStyleTag(html, tags, primaryTag) {
  // Build a combined regex that matches any open or close alias tag
  const tagPattern = tags.map((t) => `${t}`).join("|");
  const anyTagRe = new RegExp(`</?(?:${tagPattern})>`, "gi");
  const stripped = html.replace(anyTagRe, "");
  if (stripped !== html) {
    // At least one alias was present – return with all removed
    return stripped;
  }
  // No alias found – add the canonical tag
  return `<${primaryTag}>${html}</${primaryTag}>`;
}
/**
 * Apply a style to a single item's full text via a SetText action.
 */
function applyStyleToItem(item, command) {
  const tags = STYLE_TAGS[command];
  const primary = STYLE_TAG_PRIMARY[command];
  const newText = toggleStyleTag(item.text, tags, primary);
  return new actions.SetText(item, newText);
}
class Style extends Command {
  constructor() {
    super(...arguments);
    this.editMode = null;
  }
  execute() {
    if (app.editing) {
      // Single-item edit mode: use execCommand for cursor-aware formatting
      document.execCommand(this.command, false);
      return;
    }
    const selected = app.getAllSelected();
    if (selected.length > 1) {
      // Multi-selection: apply style to every selected item as one undo step
      const subactions = selected.map((item) =>
        applyStyleToItem(item, this.command),
      );
      app.action(new actions.Multi(subactions));
    } else {
      // Single item (no multi-selection): use the original execCommand path
      // so that partial-text selection inside a node still works
      commandRepo.get("edit").execute();
      let selection = getSelection();
      let range = selection.getRangeAt(0);
      range.selectNodeContents(app.currentItem.dom.text);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand(this.command, false);
      commandRepo.get("finish").execute();
    }
  }
}
new (class Bold extends Style {
  constructor() {
    super("bold", "Bold");
    this.keys = [{ code: "KeyB", ctrlKey: true }];
    this.command = "bold";
  }
})();
new (class Underline extends Style {
  constructor() {
    super("underline", "Underline");
    this.keys = [{ code: "KeyU", ctrlKey: true }];
    this.command = "underline";
  }
})();
new (class Italic extends Style {
  constructor() {
    super("italic", "Italic");
    this.keys = [{ code: "KeyI", ctrlKey: true }];
    this.command = "italic";
  }
})();
new (class Strikethrough extends Style {
  constructor() {
    super("strikethrough", "Strike-through");
    this.keys = [{ code: "KeyS", ctrlKey: true }];
    this.command = "strikeThrough";
  }
})();
new (class Value extends Command {
  constructor() {
    super("value", "Set value");
    this.keys = [{ key: "v", ctrlKey: false, metaKey: false }];
  }
  execute() {
    // Opens the Kobalte-based ValueDialog (see components/ValueDialog.jsx)
    // instead of blocking synchronously on window.prompt(). The dialog
    // reads store.js's currentItem itself and dispatches the SetValue
    // action on confirm.
    openValueDialog();
  }
})();
new (class Yes extends Command {
  constructor() {
    super("yes", "Yes");
    this.keys = [{ key: "y", ctrlKey: false }];
  }
  execute() {
    // Apply to all selected items: toggle based on currentItem's current status
    const current = app.currentItem;
    const newStatus = current.status === true ? null : true;
    const subactions = app
      .getAllSelected()
      .map((item) => new actions.SetStatus(item, newStatus));
    app.action(
      subactions.length === 1 ? subactions[0] : new actions.Multi(subactions),
    );
  }
})();
new (class No extends Command {
  constructor() {
    super("no", "No");
    this.keys = [{ key: "n", ctrlKey: false }];
  }
  execute() {
    const current = app.currentItem;
    const newStatus = current.status === false ? null : false;
    const subactions = app
      .getAllSelected()
      .map((item) => new actions.SetStatus(item, newStatus));
    app.action(
      subactions.length === 1 ? subactions[0] : new actions.Multi(subactions),
    );
  }
})();
new (class Computed extends Command {
  constructor() {
    super("computed", "Computed");
    this.keys = [{ key: "c", ctrlKey: false, metaKey: false }];
  }
  execute() {
    let item = app.currentItem;
    let status = item.status == "computed" ? null : "computed";
    let action = new actions.SetStatus(item, status);
    app.action(action);
  }
})();
