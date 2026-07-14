// src/command/select.ts
import * as app from "../my-mind.js";
import Command, { isMac } from "./command.js";
new (class Select extends Command {
    constructor() {
        super("select", "Move selection");
        this.keys = [
            { code: "ArrowLeft", ctrlKey: false, shiftKey: false },
            { code: "ArrowUp", ctrlKey: false, shiftKey: false },
            { code: "ArrowRight", ctrlKey: false, shiftKey: false },
            { code: "ArrowDown", ctrlKey: false, shiftKey: false }
        ];
    }
    execute(e) {
        const dirs = {
            "ArrowLeft": "left",
            "ArrowUp": "top",
            "ArrowRight": "right",
            "ArrowDown": "bottom"
        };
        const dir = dirs[e.code];
        const layout = app.currentItem.resolvedLayout;
        const item = layout.pick(app.currentItem, dir);
        app.selectItem(item);
    }
});
new (class SelectAdd extends Command {
    constructor() {
        super("select-add", "Add to selection");
        this.keys = [
            { code: "ArrowLeft", ctrlKey: false, shiftKey: true },
            { code: "ArrowUp", ctrlKey: false, shiftKey: true },
            { code: "ArrowRight", ctrlKey: false, shiftKey: true },
            { code: "ArrowDown", ctrlKey: false, shiftKey: true }
        ];
    }
    execute(e) {
        var _a;
        const dirs = {
            "ArrowLeft": "left",
            "ArrowUp": "top",
            "ArrowRight": "right",
            "ArrowDown": "bottom"
        };
        const dir = dirs[e.code];
        // Start from the current selection cursor (or currentItem if none yet)
        const from = (_a = app.selectionCursor) !== null && _a !== void 0 ? _a : app.currentItem;
        const layout = from.resolvedLayout;
        const next = layout.pick(from, dir);
        // Boundary reached: pick() returned the same item
        if (next === from) {
            return;
        }
        app.extendSelection(next);
        app.currentMap.ensureItemVisibility(next);
    }
});
new (class SelectRoot extends Command {
    constructor() {
        super("select-root", "Select root");
        this.keys = [{ code: "Home" }];
    }
    execute() {
        let item = app.currentItem;
        while (!item.isRoot) {
            item = item.parent;
        }
        app.selectItem(item);
    }
});
// Macs use "Backspace" to delete instead
if (!isMac()) {
    new (class SelectParent extends Command {
        constructor() {
            super("select-parent", "Select parent");
            this.keys = [{ code: "Backspace" }];
        }
        execute() {
            if (app.currentItem.isRoot) {
                return;
            }
            app.selectItem(app.currentItem.parent);
        }
    });
}
