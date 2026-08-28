// engineCommands.js — command set for engine-only actions: text
// formatting, tree edits, undo/redo, viewport, and per-item metadata
// (status/value/side/...). Anything that operates purely on the current
// selection and the tree itself, with no knowledge of this host app.
//
// Split out of newContextMenuCommands.js per docs/mind-map-core-engine-library.md's
// Step 3: this file lives under core/, so it may only depend on other
// core/** modules (enforced by eslint.config.js's no-restricted-imports
// rule) -- unlike the old merged repo, core/newKeyboard.js can import
// this file directly without pulling in store.js/ui/*/backend/* through
// app-only commands like "save" or "catalog-list". Those app commands
// now live in appCommands.js instead; newContextMenuCommands.js merges
// both repos back together for host-side UI (ContextMenu.jsx,
// LeftPanel.jsx, HelpPanel.jsx, TopBar.jsx) that doesn't care which
// layer a given command belongs to.
import {
  currentItem,
  editing,
  setEditing,
  selectedItems,
} from "./itemSelection.js";
import { startEditing, commitEditing } from "./newEdit.js";
import {
  action,
  InsertNewItem,
  RemoveItem,
  Swap,
  SetSide,
  SetText,
  SetStatus,
  Multi,
} from "./newAction.js";
import * as history from "./history.js";
import * as newViewport from "./newViewport.js";
import { isCanvasActive } from "./scope.js";

// Pan (WASD, held down): mirrors command/command.js's Pan command
// (state machine + setInterval + keyup listener), adapted to call
// newViewport.moveBy() instead of app.currentMap.moveBy(). Kept as a
// small module-level object rather than a repo entry with its own
// mutable state, since Pan needs to track "which of WASD are currently
// held" independently of the generic execute(e) shape every other
// command here uses.
const PAN_AMOUNT = 15;
let panKeyboardScope = globalThis.window ?? null;

// Called by newKeyboard.js's init()/dispose() so the keyup listener that
// ends a pan is scoped to the same container keydown is scoped to,
// mirroring command/command.js's setKeyboardScope().
export function setPanKeyboardScope(scope) {
  panKeyboardScope = scope ?? globalThis.window ?? null;
}

const PAN_DIRS = {
  KeyW: [0, 1],
  KeyA: [1, 0],
  KeyS: [0, -1],
  KeyD: [-1, 0],
};

const pan = {
  codes: [],
  interval: null,
  execute(e) {
    const { code } = e;
    if (this.codes.indexOf(code) > -1) {
      return;
    }
    if (!this.codes.length) {
      panKeyboardScope?.addEventListener("keyup", this);
      this.interval = setInterval(() => this.step(), 50);
    }
    this.codes.push(code);
    this.step();
  },
  step() {
    // Guards here, not in execute(), so a WASD key held down while
    // switching away from canvas mode (e.g. into notes) stops moving
    // the map instead of continuing via the still-running interval --
    // mirrors command/command.js's Pan.step() and its own regression
    // test (pan-keyboard-scope.test.js).
    if (!isCanvasActive()) {
      return;
    }
    const offset = [0, 0];
    this.codes.forEach((code) => {
      offset[0] += PAN_DIRS[code][0] * PAN_AMOUNT;
      offset[1] += PAN_DIRS[code][1] * PAN_AMOUNT;
    });
    newViewport.moveBy(offset);
  },
  handleEvent(e) {
    const index = this.codes.indexOf(e.code);
    if (index > -1) {
      this.codes.splice(index, 1);
      if (!this.codes.length) {
        this.dispose();
      }
    }
  },
  dispose() {
    panKeyboardScope?.removeEventListener("keyup", this);
    clearInterval(this.interval);
    this.codes = [];
  },
};

// Called by newKeyboard.js's dispose() so an in-progress pan doesn't
// keep its setInterval running past unmount.
export function disposePan() {
  pan.dispose();
}

function insertAndEdit(insertAction) {
  insertAction.do();
  if (startEditing(insertAction.item)) {
    setEditing(true);
  }
}

// All currently selected items (currentItem plus any multi-selection),
// mirroring my-mind.js's getAllSelected() / newMouse.js's own copy of
// the same helper -- itemSelection.js exposes the underlying signals
// but no combined getter of its own.
function getAllSelectedItems() {
  const all = [currentItem()];
  selectedItems().forEach((item) => all.push(item));
  return all.filter(Boolean);
}

// Toggles a style tag ("bold" -> <b>, etc.) across an HTML string,
// ported unchanged from the old engine's command/edit.js. Accepts
// multiple browser-variant tag aliases (e.g. strikeThrough -> <s> or
// <strike>) -- if ANY alias appears anywhere in the HTML, every
// occurrence of every alias is stripped; otherwise the whole string is
// wrapped in the canonical (primary) tag.
const STYLE_TAGS = {
  bold: ["b", "strong"],
  italic: ["i", "em"],
  underline: ["u"],
  strikeThrough: ["s", "strike"],
};
const STYLE_TAG_PRIMARY = {
  bold: "b",
  italic: "i",
  underline: "u",
  strikeThrough: "s",
};

function toggleStyleTag(html, tags, primaryTag) {
  const tagPattern = tags.join("|");
  const anyTagRe = new RegExp(`</?(?:${tagPattern})>`, "gi");
  const stripped = html.replace(anyTagRe, "");
  if (stripped !== html) {
    return stripped;
  }
  return `<${primaryTag}>${html}</${primaryTag}>`;
}

function applyStyleToItem(item, command) {
  const newText = toggleStyleTag(
    item.text,
    STYLE_TAGS[command],
    STYLE_TAG_PRIMARY[command],
  );
  return new SetText(item, newText);
}

// Runs a Bold/Italic/Underline/Strikethrough command, mirroring the old
// engine's command/edit.js Style class:
// - while actively editing a node's text, format the current cursor
//   selection via execCommand (cursor-aware; also reachable while
//   editing through newKeyboard.js's own mode:"editing" fast path);
// - with several items multi-selected, toggle the style across every
//   selected item's whole text as a single undo step;
// - with a single item selected but not currently editing, select its
//   entire text, run execCommand, then commit -- so the whole node's
//   content gets styled without the user having to enter edit mode
//   first.
function runStyleCommand(command) {
  if (editing()) {
    document.execCommand(command, false);
    return;
  }
  const selected = getAllSelectedItems();
  if (selected.length > 1) {
    const subactions = selected.map((item) => applyStyleToItem(item, command));
    action(new Multi(subactions));
    return;
  }
  const item = currentItem();
  if (!item) {
    return;
  }
  const textEl = startEditing(item);
  if (!textEl) {
    return;
  }
  setEditing(true);
  const selection = getSelection();
  const range = document.createRange();
  range.selectNodeContents(textEl);
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand(command, false);
  commitEditing(item);
  setEditing(false);
}

export const repo = new Map([
  [
    "insert-child",
    {
      label: "Insert a child",
      get isValid() {
        return !editing();
      },
      execute() {
        const item = currentItem();
        if (!item) return;
        insertAndEdit(new InsertNewItem(item, item.children.length));
      },
    },
  ],
  [
    "insert-sibling",
    {
      label: "Insert a sibling",
      get isValid() {
        return !editing();
      },
      execute() {
        const item = currentItem();
        if (!item) return;
        let insertAction;
        if (item.isRoot) {
          insertAction = new InsertNewItem(item, item.children.length);
        } else {
          const parent = item.parent;
          insertAction = new InsertNewItem(
            parent,
            parent.children.indexOf(item) + 1,
          );
        }
        insertAndEdit(insertAction);
      },
    },
  ],
  [
    "delete",
    {
      label: "Delete an item",
      get isValid() {
        return !editing() && !currentItem()?.isRoot;
      },
      execute() {
        const item = currentItem();
        if (!item || item.isRoot) return;
        action(new RemoveItem(item));
      },
    },
  ],
  [
    "edit",
    {
      label: "Edit item",
      get isValid() {
        return !editing();
      },
      execute() {
        const item = currentItem();
        if (item && startEditing(item)) {
          setEditing(true);
        }
      },
    },
  ],
  [
    "bold",
    {
      label: "Bold",
      get isValid() {
        return !!currentItem();
      },
      keys: [{ code: "KeyB", ctrlKey: true, shiftKey: false }],
      execute: () => runStyleCommand("bold"),
    },
  ],
  [
    "italic",
    {
      label: "Italic",
      get isValid() {
        return !!currentItem();
      },
      keys: [{ code: "KeyI", ctrlKey: true, shiftKey: false }],
      execute: () => runStyleCommand("italic"),
    },
  ],
  [
    "underline",
    {
      label: "Underline",
      get isValid() {
        return !!currentItem();
      },
      keys: [{ code: "KeyU", ctrlKey: true, shiftKey: false }],
      execute: () => runStyleCommand("underline"),
    },
  ],
  [
    "strikethrough",
    {
      label: "Strike-through",
      get isValid() {
        return !!currentItem();
      },
      keys: [{ code: "KeyS", ctrlKey: true, shiftKey: false }],
      execute: () => runStyleCommand("strikeThrough"),
    },
  ],
  [
    "yes",
    {
      label: "Yes",
      get isValid() {
        return !editing() && !!currentItem();
      },
      keys: [{ key: "y", ctrlKey: false }],
      execute() {
        const current = currentItem();
        if (!current) return;
        const newStatus = current.status === true ? null : true;
        const subactions = getAllSelectedItems().map(
          (item) => new SetStatus(item, newStatus),
        );
        action(subactions.length === 1 ? subactions[0] : new Multi(subactions));
      },
    },
  ],
  [
    "no",
    {
      label: "No",
      get isValid() {
        return !editing() && !!currentItem();
      },
      keys: [{ key: "n", ctrlKey: false }],
      execute() {
        const current = currentItem();
        if (!current) return;
        const newStatus = current.status === false ? null : false;
        const subactions = getAllSelectedItems().map(
          (item) => new SetStatus(item, newStatus),
        );
        action(subactions.length === 1 ? subactions[0] : new Multi(subactions));
      },
    },
  ],
  [
    "computed",
    {
      label: "Computed",
      get isValid() {
        return !editing() && !!currentItem();
      },
      keys: [{ key: "c", ctrlKey: false, metaKey: false }],
      execute() {
        const item = currentItem();
        if (!item) return;
        const status = item.status == "computed" ? null : "computed";
        action(new SetStatus(item, status));
      },
    },
  ],
  [
    "undo",
    {
      label: "Undo",
      get isValid() {
        history.historyVersion();
        return history.canBack();
      },
      execute: () => history.back(),
    },
  ],
  [
    "redo",
    {
      label: "Redo",
      get isValid() {
        history.historyVersion();
        return history.canForward();
      },
      execute: () => history.forward(),
    },
  ],
  [
    "center",
    {
      label: "Center map",
      isValid: true,
      keys: [{ code: "End" }],
      execute: () => newViewport.recenter(),
    },
  ],
  [
    "zoom-in",
    {
      label: "Zoom in",
      isValid: true,
      keys: [{ key: "+" }],
      execute: () => newViewport.adjustZoom(1),
    },
  ],
  [
    "zoom-out",
    {
      label: "Zoom out",
      isValid: true,
      keys: [{ key: "-" }],
      execute: () => newViewport.adjustZoom(-1),
    },
  ],
  [
    "fold",
    {
      label: "Fold/Unfold",
      get isValid() {
        return !editing() && !!currentItem();
      },
      keys: [{ key: "f", ctrlKey: false }],
      execute() {
        const item = currentItem();
        if (!item) {
          return;
        }
        item.collapsed = !item.collapsed;
      },
    },
  ],
  [
    "swap",
    {
      label: "Swap sibling",
      get isValid() {
        return !editing() && !!currentItem() && !currentItem().isRoot;
      },
      keys: [
        { code: "ArrowUp", ctrlKey: true },
        { code: "ArrowDown", ctrlKey: true },
      ],
      execute(e) {
        const item = currentItem();
        if (!item || item.isRoot || item.parent.children.length < 2) {
          return;
        }
        const diff = e.code == "ArrowUp" ? -1 : 1;
        action(new Swap(item, diff));
      },
    },
  ],
  [
    "side",
    {
      label: "Change side",
      get isValid() {
        const item = currentItem();
        return !editing() && !!item && !item.isRoot && !!item.parent?.isRoot;
      },
      keys: [
        { code: "ArrowLeft", ctrlKey: true },
        { code: "ArrowRight", ctrlKey: true },
      ],
      execute(e) {
        const item = currentItem();
        if (!item || item.isRoot || !item.parent.isRoot) {
          return;
        }
        const side = e.code == "ArrowLeft" ? "left" : "right";
        action(new SetSide(item, side));
      },
    },
  ],
  [
    "pan",
    {
      label: "Pan the map",
      isValid: true,
      keys: [
        { code: "KeyW", ctrlKey: false, altKey: false, metaKey: false },
        { code: "KeyA", ctrlKey: false, altKey: false, metaKey: false },
        { code: "KeyS", ctrlKey: false, altKey: false, metaKey: false },
        { code: "KeyD", ctrlKey: false, altKey: false, metaKey: false },
      ],
      execute: (e) => pan.execute(e),
    },
  ],
]);
