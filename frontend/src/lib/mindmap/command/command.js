// src/command/command.ts
import * as pubsub from "../pubsub.js";
import * as history from "../history.js";
import * as app from "../my-mind.js";
import * as help from "../ui/help.js";
import * as notes from "../ui/notes.js";
import * as ui from "../ui/ui.js";
import * as io from "../ui/io.js";
import { showToast } from "../ui/toast.js";
import * as fileSwitcher from "../ui/file-switcher.js";
import ImageBackend from "../backend/image.js";
import * as actions from "../action.js";
import MindMap from "../map.js";

const PAN_AMOUNT = 15;
export function isMac() {
  return !!navigator.platform.match(/mac/i);
}
export let repo = new Map();
export default class Command {
  constructor(id, label) {
    this.label = label;
    this.editMode = false;
    repo.set(id, this);
  }
  get isValid() {
    return this.editMode === null || this.editMode == app.editing;
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
    return super.isValid && history.canBack();
  }
  execute() {
    history.back();
  }
})();
new (class Redo extends Command {
  constructor() {
    super("redo", "Redo");
    this.keys = [{ code: "KeyY", ctrlKey: true }];
  }
  get isValid() {
    return super.isValid && history.canForward();
  }
  execute() {
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
    app.action(action);
    repo.get("edit").execute();
    pubsub.publish("command-sibling");
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
    app.action(action);
    repo.get("edit").execute();
    pubsub.publish("command-child");
  }
})();
new (class Delete extends Command {
  constructor() {
    super("delete", "Delete an item");
    this.keys = [{ code: isMac() ? "Backspace" : "Delete" }]; // Mac keyboards' "delete" button generates "Backspace"
  }
  get isValid() {
    return super.isValid && !app.currentItem.isRoot;
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
  execute() {
    io.quickSave();
  }
})();
new (class SaveAs extends Command {
  constructor() {
    super("save-as", "Save as…");
    this.keys = [];
  }
  execute() {
    io.show("save");
  }
})();
new (class Load extends Command {
  constructor() {
    super("load", "Load map");
    this.keys = [{ code: "KeyO", ctrlKey: true, shiftKey: false }];
  }
  execute() {
    fileSwitcher.toggle();
  }
})();
new (class New extends Command {
  constructor() {
    super("new", "New map");
    this.keys = [{ code: "KeyO", ctrlKey: true, shiftKey: true }];
  }
  execute() {
    app.showMap(new MindMap());
    pubsub.publish("map-new");
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
    app.currentMap.adjustFontSize(1);
  }
})();
new (class ZoomOut extends Command {
  constructor() {
    super("zoom-out", "Zoom out");
    this.keys = [{ key: "-" }];
  }
  execute() {
    app.currentMap.adjustFontSize(-1);
  }
})();
new (class Help extends Command {
  constructor() {
    super("help", "Show/hide help");
    this.keys = [{ key: "?" }];
  }
  execute() {
    help.toggle();
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
      window.addEventListener("keyup", this);
      this.interval = setInterval(() => this.step(), 50);
    }
    this.codes.push(code);
    this.step();
  }
  step() {
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
        window.removeEventListener("keyup", this);
        clearInterval(this.interval);
      }
    }
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
new (class QuickLoad extends Command {
  constructor() {
    super("quick-load", "File picker");
    this.keys = [{ code: "KeyK", ctrlKey: true }];
  }
  execute() {
    fileSwitcher.toggle();
  }
})();
new (class GoToCatalog extends Command {
  constructor() {
    super("go-to-catalog", "Go to catalog");
    this.keys = [{ code: "KeyP", ctrlKey: true }];
  }
  async execute() {
    await io.quickSave();
    window.location.href = "/catalog";
  }
})();
new (class CopyImage extends Command {
  constructor() {
    super("copy-image", "Copy image");
    this.keys = [{ code: "KeyC", ctrlKey: true, shiftKey: true }];
  }
  async execute() {
    var _a;
    app.setThrobber(true);
    try {
      const backend = new ImageBackend();
      const url = await backend.save("png");
      if (
        (_a = navigator.clipboard) === null || _a === void 0 ? void 0 : _a.write
      ) {
        const res = await fetch(url);
        const blob = await res.blob();
        URL.revokeObjectURL(url);
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        showToast("Copied", app.currentMap.name);
      } else {
        window.open(url, "_blank");
      }
    } finally {
      app.setThrobber(false);
    }
  }
})();
