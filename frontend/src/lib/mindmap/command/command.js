// src/command/command.ts

import * as history from "../history.js";
import * as app from "../my-mind.js";
import * as notes from "../ui/notes.js";
import * as ui from "../ui/ui.js";
import * as io from "../ui/io.js";
import { showToast } from "../ui/toast.jsx";
import {
  openHelp,
  openSnapshots,
  openCatalogList,
  openFileSwitcher,
} from "../store.js";

import ImageBackend from "../backend/image.js";
import * as actions from "../action.js";
import MindMap from "../map.js";
import { isCanvasActive } from "../scope.js";
import {
  setLeftPanelHidden,
  editing as editingSignal,
  currentItem as currentItemSignal,
  activeMode,
  notesHistoryVersion,
} from "../store.js";

const PAN_AMOUNT = 15;
let keyboardScope = globalThis.window ?? null;

export function setKeyboardScope(scope) {
  keyboardScope = scope ?? globalThis.window ?? null;
}
export function isMac() {
  return !!(globalThis.navigator?.platform ?? "").match(/mac/i);
}
export let repo = new Map();

// Executes a command by id. Small shared helper so components outside
// ui/ui.js's data-command click delegation (e.g. LeftPanel/TopBar, which
// will live outside the canvas-scoped container once moved to
// Workspace.jsx) can trigger a command the same way a delegated click
// would, without duplicating "repo.get(id).execute()" in each caller.
export function execute(id) {
  repo.get(id).execute();
}
export default class Command {
  constructor(id, label) {
    this.label = label;
    this.editMode = false;
    repo.set(id, this);
  }
  get isValid() {
    // Reads store.js's editing signal (mirrored from app.editing by
    // my-mind.js's startEditing()/stopEditing()) rather than the plain
    // `app.editing` field directly, so any Solid computation reading
    // `.isValid` (e.g. ContextMenu.jsx's disabled attribute) stays
    // correct across edit-mode changes instead of only reflecting the
    // value at the moment the menu happened to render.
    return this.editMode === null || this.editMode == editingSignal();
  }
}
new (class Notes extends Command {
  constructor() {
    super("notes", "Notes");
    this.keys = [{ code: "KeyM", ctrlKey: true }];
  }
  execute() {
    notes.toggle();
  }
})();
new (class Undo extends Command {
  constructor() {
    super("undo", "Undo");
    this.keys = [{ code: "KeyZ", ctrlKey: true }];
  }
  get isValid() {
    // While notes is the active workspace mode, Undo acts on the notes
    // editor's own CodeMirror history instead of the mindmap's -- see
    // notes.js's canUndo() and NotesEditor.jsx's bumpNotesHistoryVersion().
    if (activeMode() === "notes") {
      notesHistoryVersion();
      return super.isValid && notes.canUndo();
    }
    // history.canBack() itself reads a plain module-level array, not a
    // signal, so reading historyVersion() first is what actually
    // subscribes this getter to undo-stack changes (see history.js).
    history.historyVersion();
    return super.isValid && history.canBack();
  }
  execute() {
    if (activeMode() === "notes") {
      notes.undo();
      return;
    }
    history.back();
  }
})();
new (class Redo extends Command {
  constructor() {
    super("redo", "Redo");
    this.keys = [{ code: "KeyY", ctrlKey: true }];
  }
  get isValid() {
    if (activeMode() === "notes") {
      notesHistoryVersion();
      return super.isValid && notes.canRedo();
    }
    history.historyVersion();
    return super.isValid && history.canForward();
  }
  execute() {
    if (activeMode() === "notes") {
      notes.redo();
      return;
    }
    history.forward();
  }
})();
new (class InsertSibling extends Command {
  constructor() {
    super("insert-sibling", "Insert a sibling");
    this.keys = [{ code: "Enter" }];
  }
  execute() {
    let item = app.currentItem;
    let action;
    if (item.isRoot) {
      action = new actions.InsertNewItem(item, item.children.length);
    } else {
      let parent = item.parent;
      let index = parent.children.indexOf(item);
      action = new actions.InsertNewItem(parent, index + 1);
    }
    // Insert the draft item directly, without pushing it to history yet.
    // It only becomes an undoable action once it has real content (see
    // command/edit.js's Finish) -- an empty node that's immediately
    // discarded should never leave a trace in the undo stack.
    action.do();
    repo.get("edit").execute();
  }
})();
new (class InsertChild extends Command {
  constructor() {
    super("insert-child", "Insert a child");
    this.keys = [{ code: "Tab", ctrlKey: false }, { code: "Insert" }];
  }
  execute() {
    let item = app.currentItem;
    let action = new actions.InsertNewItem(item, item.children.length);
    // See InsertSibling above: draft insertion is not pushed to history.
    action.do();
    repo.get("edit").execute();
  }
})();
new (class Delete extends Command {
  constructor() {
    super("delete", "Delete an item");
    this.keys = [{ code: isMac() ? "Backspace" : "Delete" }]; // Mac keyboards' "delete" button generates "Backspace"
  }
  get isValid() {
    // Reads store.js's currentItem signal, not the plain app.currentItem
    // field, so this stays correct if selection changes while something
    // is observing .isValid (e.g. ContextMenu.jsx staying open across a
    // selection change).
    return super.isValid && !currentItemSignal()?.isRoot;
  }
  execute() {
    // Delete all selected non-root items in one undoable action
    const toDelete = app.getAllSelected().filter((i) => !i.isRoot);
    if (toDelete.length === 0) {
      return;
    }
    const subactions = toDelete.map((item) => new actions.RemoveItem(item));
    app.action(
      toDelete.length === 1 ? subactions[0] : new actions.Multi(subactions),
    );
  }
})();
new (class Swap extends Command {
  constructor() {
    super("swap", "Swap sibling");
    this.keys = [
      { code: "ArrowUp", ctrlKey: true },
      { code: "ArrowDown", ctrlKey: true },
    ];
  }
  execute(e) {
    let current = app.currentItem;
    if (current.isRoot || current.parent.children.length < 2) {
      return;
    }
    let diff = e.code == "ArrowUp" ? -1 : 1;
    let action = new actions.Swap(current, diff);
    app.action(action);
  }
})();
new (class SetSide extends Command {
  constructor() {
    super("side", "Change side");
    this.keys = [
      { code: "ArrowLeft", ctrlKey: true },
      { code: "ArrowRight", ctrlKey: true },
    ];
  }
  execute(e) {
    let current = app.currentItem;
    // applies only to direct root descendants
    if (current.isRoot || !current.parent.isRoot) {
      return;
    }
    let side = e.code == "ArrowLeft" ? "left" : "right";
    let action = new actions.SetSide(app.currentItem, side);
    app.action(action);
  }
})();
new (class Save extends Command {
  constructor() {
    super("save", "Save map");
    this.keys = [{ code: "KeyS", ctrlKey: true, shiftKey: true }];
  }
  async execute() {
    const saved = await io.quickSave();
    if (saved) {
      showToast("Mind map saved");
    } else {
      showToast("Failed to save mind map", undefined, { variant: "error" });
    }
  }
})();
// Renders the current map as a transparent PNG and copies it to the
// system clipboard, falling back to opening it in a new tab if the
// Clipboard API isn't available. Shared by SaveAs and CopyImage below,
// since they now do the same thing under different keybindings.
async function copyMapImageToClipboard() {
  app.setThrobber(true);
  try {
    const backend = new ImageBackend();
    const url = await backend.save("png");
    if (navigator.clipboard?.write) {
      const res = await fetch(url);
      const blob = await res.blob();
      URL.revokeObjectURL(url);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      showToast("Mind map image copied to clipboard");
    } else {
      window.open(url, "_blank");
    }
  } finally {
    app.setThrobber(false);
  }
}
new (class SaveAs extends Command {
  constructor() {
    super("save-as", "Save as…");
    this.keys = [];
  }
  execute() {
    copyMapImageToClipboard();
  }
})();

new (class Recover extends Command {
  constructor() {
    super("recover", "Restore a past snapshot");
    this.keys = [];
  }
  execute() {
    setLeftPanelHidden(false);
    openSnapshots();
  }
})();

new (class CatalogList extends Command {
  constructor() {
    super("catalog-list", "Browse maps");
    this.keys = [];
  }
  execute() {
    setLeftPanelHidden(false);
    openCatalogList();
  }
})();

new (class FileSwitcher extends Command {
  constructor() {
    super("file-switcher", "Switch map");
    this.keys = [{ code: "KeyK", ctrlKey: true }];
  }
  execute() {
    openFileSwitcher();
  }
})();

new (class New extends Command {
  constructor() {
    super("new", "New map");
    this.keys = [{ code: "KeyO", ctrlKey: true, shiftKey: true }];
  }
  async execute() {
    // Persist the current map (with a fresh thumbnail) before switching
    // away, mirroring GoToCatalog's save-before-navigate pattern. Skips
    // entirely when auto-save is off (see io.saveBeforeLeaving()).
    await io.saveBeforeLeaving();
    // Forget the just-saved map's id/title/uuid so the new blank map
    // starts as an unsaved map, not as an edit of the old record.
    io.resetCurrentMap();
    app.showMap(new MindMap());
  }
})();

new (class Center extends Command {
  constructor() {
    super("center", "Center map");
    this.keys = [{ code: "End" }];
  }
  execute() {
    app.currentMap.center();
  }
})();
new (class ZoomIn extends Command {
  constructor() {
    super("zoom-in", "Zoom in");
    this.keys = [{ key: "+" }];
  }
  execute() {
    app.currentMap.adjustZoom(1);
  }
})();
new (class ZoomOut extends Command {
  constructor() {
    super("zoom-out", "Zoom out");
    this.keys = [{ key: "-" }];
  }
  execute() {
    app.currentMap.adjustZoom(-1);
  }
})();
new (class Help extends Command {
  constructor() {
    super("help", "Show/hide help");
    this.keys = [{ key: "?" }];
  }
  execute() {
    // Help content now renders inside the left sidebar (see
    // LeftPanel.jsx), same as the Recover command below: opening it
    // also expands the sidebar so the content is actually visible.
    // Always opens (rather than toggling) so it behaves like a tab:
    // repeated presses just keep help open instead of hiding it again.
    openHelp();
    setLeftPanelHidden(false);
  }
})();
new (class UI extends Command {
  constructor() {
    super("ui", "Show/hide UI");
    this.keys = [{ key: "*" }];
  }
  execute() {
    ui.toggle();
  }
})();
new (class Pan extends Command {
  constructor() {
    super("pan", "Pan the map");
    this.keys = [
      { code: "KeyW", ctrlKey: false, altKey: false, metaKey: false },
      { code: "KeyA", ctrlKey: false, altKey: false, metaKey: false },
      { code: "KeyS", ctrlKey: false, altKey: false, metaKey: false },
      { code: "KeyD", ctrlKey: false, altKey: false, metaKey: false },
    ];
    this.codes = [];
  }
  execute(e) {
    const { code } = e;
    var index = this.codes.indexOf(code);
    if (index > -1) {
      return;
    }
    if (!this.codes.length) {
      keyboardScope.addEventListener("keyup", this);
      this.interval = setInterval(() => this.step(), 50);
    }
    this.codes.push(code);
    this.step();
  }
  step() {
    // If the user switches away from canvas mode while a WASD key is
    // still held down, the setInterval loop below keeps running (see
    // docs/workspace-mode-switch-refactor.md, Phase 3) — guard here
    // rather than in execute(), since execute() is already unreachable
    // while backgrounded (keyboard.js gates the keydown that calls it).
    if (!isCanvasActive()) {
      return;
    }
    const dirs = {
      KeyW: [0, 1],
      KeyA: [1, 0],
      KeyS: [0, -1],
      KeyD: [-1, 0],
    };
    let offset = [0, 0];
    this.codes.forEach((code) => {
      offset[0] += dirs[code][0] * PAN_AMOUNT;
      offset[1] += dirs[code][1] * PAN_AMOUNT;
    });
    app.currentMap.moveBy(offset);
  }
  handleEvent(e) {
    const { code } = e;
    var index = this.codes.indexOf(code);
    if (index > -1) {
      this.codes.splice(index, 1);
      if (!this.codes.length) {
        this.dispose();
      }
    }
  }
  dispose() {
    keyboardScope?.removeEventListener("keyup", this);
    clearInterval(this.interval);
    this.codes = [];
  }
})();
new (class Fold extends Command {
  constructor() {
    super("fold", "Fold/Unfold");
    this.keys = [{ key: "f", ctrlKey: false }];
  }
  execute() {
    let item = app.currentItem;
    item.collapsed = !item.collapsed;
    app.currentMap.ensureItemVisibility(item);
  }
})();

new (class GoToCatalog extends Command {
  constructor() {
    super("go-to-catalog", "Go to catalog");
    this.keys = [{ code: "KeyP", ctrlKey: true }];
  }
  async execute() {
    await io.saveBeforeLeaving();
    window.location.href = "/catalog";
  }
})();
new (class CopyImage extends Command {
  constructor() {
    super("copy-image", "Copy image");
    this.keys = [{ code: "KeyC", ctrlKey: true, shiftKey: true }];
  }
  execute() {
    copyMapImageToClipboard();
  }
})();
