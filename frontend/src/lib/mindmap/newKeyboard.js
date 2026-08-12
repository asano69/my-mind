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
  selectionCursor,
  selectItem,
  extendSelection,
  editing,
  setEditing,
} from "./itemSelection.js";
import { startEditing, commitEditing, discardEditing } from "./newEdit.js";

function isMac() {
  return !!(globalThis.navigator?.platform ?? "").match(/mac/i);
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
    keys: [
      { code: "Enter", altKey: false, ctrlKey: false, shiftKey: false },
    ],
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
  }
}

export function init(containerEl) {
  containerEl.addEventListener("keydown", handleEvent);
  containerEl.addEventListener("focusout", handleFocusOut);
  if (hasDocument()) {
    document.addEventListener("focusin", handleFocusIn);
  }
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
