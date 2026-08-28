// newKeyboard.js — keyboard shortcuts for the ?newEngine=1 preview.
//
// Phase 4.4 of docs/08-mindmap-engine-refactor.md: only the
// non-destructive selection-movement commands from command/select.js
// (Select, SelectAdd, SelectRoot, SelectParent) are ported here, since
// they have no item.dom dependency and resolvedLayout already exists
// on itemStore.js's ItemNode.
//
// The containerEl scoping, isCanvasActive() guard, IME composition
// check, and the rAF-based focus self-heal guard are ported unchanged
// from keyboard.js -- these are DOM/browser-level fixes (see CLAUDE.md's
// "タイトル編集不可バグ" note) independent of which engine owns the
// tree, so the logic is duplicated here rather than shared, avoiding a
// dependency on the old engine's command/command.js module graph.
import { isCanvasActive } from "./scope.js";
import {
  currentItem,
  selectedItems,
  selectionCursor,
  selectItem,
  extendSelection,
  editing,
  setEditing,
} from "./itemSelection.js";
import { startEditing, commitEditing, discardEditing } from "./newEdit.js";
import * as history from "./history.js";
import { action, InsertNewItem, RemoveItem, Multi } from "./newAction.js";
import {
  repo as sharedCommandRepo,
  setPanKeyboardScope,
  disposePan,
} from "./engineCommands.js";

// Commands registered by the host app (save, notes, file-switcher, ...),
// kept out of core/** itself so this module never has to import
// store.js/ui/* directly -- see docs/mind-map-core-engine-library.md's
// Step 3 and navigation.js's registerNavigate() for the same "host
// registers, vanilla module reads" bridge pattern. Only ever consulted
// as a fallback, same as sharedCommandRepo below.
let extraCommandRepo = null;
export function registerExtraCommands(repo) {
  extraCommandRepo = repo;
}

function isMac() {
  return !!(globalThis.navigator?.platform ?? "").match(/mac/i);
}

// All currently selected items (currentItem plus any multi-selection),
// mirroring my-mind.js's getAllSelected() / newMouse.js's own copy of
// the same helper -- itemSelection.js exposes the underlying signals
// but no combined getter of its own.
function getAllSelectedItems() {
  const all = [currentItem()];
  selectedItems().forEach((item) => all.push(item));
  return all;
}

// Starts editing a just-inserted draft item once its content element has
// actually mounted. insertAction.do() only bumps the parent's
// _childrenVersion signal; the new child's ItemNodeView (and the domRefs
// registration newEdit.js's startEditing() depends on) only exist after
// Solid's own effect queue flushes, so this must wait a tick rather than
// calling startEditing() synchronously right after do().
function beginEditingNewItem(item) {
  queueMicrotask(() => {
    if (startEditing(item)) {
      setEditing(true);
    }
  });
}

const DIRS = {
  ArrowLeft: "left",
  ArrowUp: "top",
  ArrowRight: "right",
  ArrowDown: "bottom",
};

const commands = [
  {
    mode: "normal",
    keys: [
      { code: "ArrowLeft", ctrlKey: false, shiftKey: false },
      { code: "ArrowUp", ctrlKey: false, shiftKey: false },
      { code: "ArrowRight", ctrlKey: false, shiftKey: false },
      { code: "ArrowDown", ctrlKey: false, shiftKey: false },
    ],
    execute(e) {
      const item = currentItem();
      if (!item) {
        return;
      }
      const next = item.resolvedLayout.pick(item, DIRS[e.code]);
      selectItem(next);
    },
  },
  {
    mode: "normal",
    keys: [
      { code: "ArrowLeft", ctrlKey: false, shiftKey: true },
      { code: "ArrowUp", ctrlKey: false, shiftKey: true },
      { code: "ArrowRight", ctrlKey: false, shiftKey: true },
      { code: "ArrowDown", ctrlKey: false, shiftKey: true },
    ],
    execute(e) {
      const from = selectionCursor() ?? currentItem();
      if (!from) {
        return;
      }
      const next = from.resolvedLayout.pick(from, DIRS[e.code]);
      if (next === from) {
        // Boundary reached: pick() returned the same item.
        return;
      }
      extendSelection(next);
    },
  },
  {
    mode: "normal",
    keys: [{ code: "Home" }],
    execute() {
      let item = currentItem();
      if (!item) {
        return;
      }
      while (!item.isRoot) {
        item = item.parent;
      }
      selectItem(item);
    },
  },
];

// Macs use "Backspace" to delete instead (see command/select.js's own
// comment for the same reasoning).
if (!isMac()) {
  commands.push({
    mode: "normal",
    keys: [{ code: "Backspace" }],
    execute() {
      const item = currentItem();
      if (!item || item.isRoot) {
        return;
      }
      selectItem(item.parent);
    },
  });
}

// Starts/commits/cancels live text editing of the currentItem -- see
// newEdit.js for the DOM-toggle mechanics. Phase 4.5 of
// docs/08-mindmap-engine-refactor.md. Mirrors item.js's Edit/Finish/
// Cancel commands (see command/edit.js), gated by `mode` here instead of
// the old engine's Command.editMode + ui.isActive() combination.
commands.push(
  {
    mode: "normal",
    keys: [{ code: "Space" }, { code: "F2" }],
    execute() {
      const item = currentItem();
      if (!item) {
        return;
      }
      if (startEditing(item)) {
        setEditing(true);
      }
    },
  },
  {
    mode: "editing",
    keys: [{ code: "Enter", altKey: false, ctrlKey: false, shiftKey: false }],
    execute() {
      const item = currentItem();
      if (!item) {
        return;
      }
      commitEditing(item);
      setEditing(false);
    },
  },
  {
    mode: "editing",
    keys: [{ code: "Escape" }],
    execute() {
      const item = currentItem();
      if (!item) {
        return;
      }
      discardEditing(item);
      setEditing(false);
    },
  },
);

// Style/format shortcuts (Bold/Italic/Underline/Strikethrough) must
// keep working while actively editing a node's text -- unlike every
// other sharedCommandRepo entry (see handleEvent() below), which is
// only consulted while NOT editing. Dispatching to the shared repo's
// own command keeps the actual formatting logic (see
// newContextMenuCommands.js's runStyleCommand()) in one place instead
// of duplicating it here.
commands.push(
  {
    mode: "editing",
    keys: [{ code: "KeyB", ctrlKey: true, shiftKey: false }],
    execute: () => sharedCommandRepo.get("bold")?.execute(),
  },
  {
    mode: "editing",
    keys: [{ code: "KeyI", ctrlKey: true, shiftKey: false }],
    execute: () => sharedCommandRepo.get("italic")?.execute(),
  },
  {
    mode: "editing",
    keys: [{ code: "KeyU", ctrlKey: true, shiftKey: false }],
    execute: () => sharedCommandRepo.get("underline")?.execute(),
  },
  {
    mode: "editing",
    keys: [{ code: "KeyS", ctrlKey: true, shiftKey: false }],
    execute: () => sharedCommandRepo.get("strikethrough")?.execute(),
  },
  {
    mode: "editing",
    keys: [
      { code: "Enter", shiftKey: true },
      { code: "Enter", ctrlKey: true },
    ],
    execute() {
      // Inserts a line break at the cursor without finishing the edit,
      // mirroring the old engine's command/edit.js Newline command.
      const range = getSelection().getRangeAt(0);
      const br = document.createElement("br");
      range.insertNode(br);
      range.setStartAfter(br);
    },
  },
);

// Insert a sibling / child and immediately start editing it, mirroring
// command/command.js's InsertSibling/InsertChild followed by the "edit"
// command. The new item is inserted via insertAction.do() directly (not
// routed through newAction.js's action()), so it is not yet an undoable
// step -- see newEdit.js's commitEditing()/discardEditing() for how a
// draft item either gets pushed to history (real content) or discarded
// (left empty), matching command/edit.js's Finish/Cancel commands.
commands.push(
  {
    mode: "normal",
    keys: [{ code: "Enter" }],
    execute() {
      const item = currentItem();
      if (!item) {
        return;
      }
      let insertAction;
      if (item.isRoot) {
        insertAction = new InsertNewItem(item, item.children.length);
      } else {
        const parent = item.parent;
        const index = parent.children.indexOf(item);
        insertAction = new InsertNewItem(parent, index + 1);
      }
      insertAction.do();
      beginEditingNewItem(insertAction.item);
    },
  },
  {
    mode: "normal",
    keys: [{ code: "Tab", ctrlKey: false }, { code: "Insert" }],
    execute() {
      const item = currentItem();
      if (!item) {
        return;
      }
      const insertAction = new InsertNewItem(item, item.children.length);
      insertAction.do();
      beginEditingNewItem(insertAction.item);
    },
  },
  {
    mode: "normal",
    keys: [{ code: isMac() ? "Backspace" : "Delete" }],
    execute() {
      const toDelete = getAllSelectedItems().filter((i) => i && !i.isRoot);
      if (toDelete.length === 0) {
        return;
      }
      const subactions = toDelete.map((item) => new RemoveItem(item));
      action(subactions.length === 1 ? subactions[0] : new Multi(subactions));
    },
  },
);

// Undo/redo (Phase 4.6 of docs/08-mindmap-engine-refactor.md): history.js
// is item-agnostic, so the same undo stack newAction.js's action() pushes
// onto (see commitEditing() in newEdit.js) can be walked directly here,
// with no per-engine history state to keep in sync. Mirrors
// command/command.js's Undo/Redo commands' key bindings.
commands.push(
  {
    mode: "normal",
    keys: [{ code: "KeyZ", ctrlKey: true }],
    execute() {
      if (history.canBack()) {
        history.back();
      }
    },
  },
  {
    mode: "normal",
    keys: [{ code: "KeyY", ctrlKey: true }],
    execute() {
      if (history.canForward()) {
        history.forward();
      }
    },
  },
);

function keyOK(key, e) {
  return Object.entries(key).every(([k, v]) => e[k] == v);
}

function handleEvent(e) {
  if (!isCanvasActive()) {
    return;
  }
  // Ignore key events that are part of IME composition (e.g. Japanese
  // input) -- same reasoning as keyboard.js's own check.
  if (e.isComposing) {
    return;
  }
  // While editing, only commands flagged mode: "editing" apply (Enter to
  // commit, Escape to cancel); everything else -- including plain
  // character keys, which never match any command's keys anyway -- falls
  // through to the browser's normal contentEditable typing. This mirrors
  // the old engine's Command.editMode + ui.isActive() gate (see
  // command/command.js), just expressed as a plain string per command
  // instead of a class hierarchy.
  const editingNow = editing();
  const command = commands.find(
    (c) =>
      (c.mode === "editing") === editingNow &&
      c.keys.find((key) => keyOK(key, e)),
  );
  if (command) {
    e.preventDefault();
    command.execute(e);
    return;
  }
  // Fallback: commands shared with ContextMenu.jsx (see
  // newContextMenuCommands.js), extended with `keys` for hotkey use.
  // Only consulted while not editing -- none of these are meant to fire
  // mid-edit, matching the old engine's Command.editMode semantics.
  if (editingNow) {
    return;
  }
  for (const sharedCommand of sharedCommandRepo.values()) {
    if (!sharedCommand.keys?.length || !sharedCommand.isValid) {
      continue;
    }
    if (sharedCommand.keys.find((key) => keyOK(key, e))) {
      e.preventDefault();
      sharedCommand.execute(e);
      return;
    }
  }
  for (const extraCommand of extraCommandRepo?.values() ?? []) {
    if (!extraCommand.keys?.length || !extraCommand.isValid) {
      continue;
    }
    if (extraCommand.keys.find((key) => keyOK(key, e))) {
      e.preventDefault();
      extraCommand.execute(e);
      return;
    }
  }
}

export function init(containerEl) {
  containerEl.addEventListener("keydown", handleEvent);
  containerEl.addEventListener("focusout", handleFocusOut);
  if (hasDocument()) {
    document.addEventListener("focusin", handleFocusIn);
  }
  setPanKeyboardScope(containerEl);
  containerEl.focus();
}

// Called by MindMapCanvas.jsx's onCleanup. Without this, remounting
// would leave the previous mount's listener attached, firing every
// shortcut twice.
export function dispose(containerEl) {
  containerEl.removeEventListener("keydown", handleEvent);
  containerEl.removeEventListener("focusout", handleFocusOut);
  if (hasDocument()) {
    document.removeEventListener("focusin", handleFocusIn);
  }
  setPanKeyboardScope();
  disposePan();
  cancelRestore();
}

// Self-healing focus guard, ported unchanged from keyboard.js -- see
// that file's own comment for the full rationale (the title-input-
// unfocusable bug, CLAUDE.md's "タイトル編集不可バグ" Phase 2).
let pendingRestore = null;

function cancelRestore() {
  if (pendingRestore !== null) {
    cancelAnimationFrame(pendingRestore);
    pendingRestore = null;
  }
}

function handleFocusOut(e) {
  const container = e.currentTarget;
  cancelRestore();
  pendingRestore = requestAnimationFrame(() => {
    pendingRestore = null;
    if (document.activeElement === document.body) {
      container.focus();
    }
  });
}

function handleFocusIn() {
  cancelRestore();
}

function hasDocument() {
  return typeof document !== "undefined";
}
