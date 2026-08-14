// newContextMenuCommands.js — command set for ContextMenu.jsx's
// right-click menu when the ?newEngine=1 preview is active. Mirrors
// the subset of command/command.js's commands the menu exposes, but
// operates on itemSelection.js's currentItem and
// newAction.js/newEdit.js/history.js instead of the old engine's
// app.currentItem -- calling the old command repo against a
// currentItem the new engine never sets is what caused
// edit/insert-child/insert-sibling/delete to throw.
import { currentItem, editing, setEditing } from "./itemSelection.js";
import { startEditing } from "./newEdit.js";
import {
  action,
  InsertNewItem,
  RemoveItem,
  Swap,
  SetSide,
} from "./newAction.js";
import * as history from "./history.js";
import {
  openValueDialog,
  openHelp,
  openSnapshots,
  openCatalogList,
  openFileSwitcher,
  setLeftPanelHidden,
  toggleRightPanel,
} from "./store.js";
import * as notes from "./ui/notes.js";
import * as newViewport from "./newViewport.js";
import * as io from "./ui/io.js";
import { showToast } from "./ui/toast.jsx";
import { navigateTo } from "./navigation.js";
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

export const repo = new Map([
  [
    "notes",
    {
      label: "Notes",
      isValid: true,
      keys: [{ code: "KeyM", ctrlKey: true }],
      // notes.js resolves the active engine's selection itself (see
      // currentSelection.js), so the same toggle() the old engine's
      // Notes command calls already works here unchanged.
      execute: () => notes.toggle(),
    },
  ],
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
    "value",
    {
      label: "Set value",
      isValid: true,
      execute: () => openValueDialog(),
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
    "save",
    {
      label: "Save map",
      isValid: true,
      keys: [{ code: "KeyS", ctrlKey: true, shiftKey: true }],
      async execute() {
        const saved = await io.quickSave();
        if (saved) {
          showToast("Mind map saved");
        } else {
          showToast("Failed to save mind map", undefined, { variant: "error" });
        }
      },
    },
  ],
  [
    "help",
    {
      label: "Show/hide help",
      isValid: true,
      keys: [{ key: "?" }],
      execute: () => {
        openHelp();
        setLeftPanelHidden(false);
      },
    },
  ],
  [
    "ui",
    {
      label: "Show/hide UI",
      isValid: true,
      keys: [{ key: "*" }],
      execute: () => toggleRightPanel(),
    },
  ],
  [
    "recover",
    {
      label: "Restore a past snapshot",
      isValid: true,
      keys: [],
      execute: () => {
        setLeftPanelHidden(false);
        openSnapshots();
      },
    },
  ],
  [
    "catalog-list",
    {
      label: "Browse maps",
      isValid: true,
      keys: [],
      execute: () => {
        setLeftPanelHidden(false);
        openCatalogList();
      },
    },
  ],
  [
    "file-switcher",
    {
      label: "Switch map",
      isValid: true,
      keys: [{ code: "KeyK", ctrlKey: true }],
      execute: () => openFileSwitcher(),
    },
  ],
  [
    "go-to-catalog",
    {
      label: "Go to catalog",
      isValid: true,
      keys: [{ code: "KeyP", ctrlKey: true }],
      async execute() {
        if (!(await io.confirmLeave())) {
          return;
        }
        if (!navigateTo("/catalog")) {
          window.location.href = "/catalog";
        }
      },
    },
  ],
  [
    "new",
    {
      label: "New map",
      isValid: true,
      keys: [{ code: "KeyO", ctrlKey: true, shiftKey: true }],
      async execute() {
        if (!(await io.confirmLeave())) {
          return;
        }
        io.resetCurrentMap();
        if (!navigateTo("/maps/new")) {
          window.location.href = "/maps/new";
        }
      },
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
