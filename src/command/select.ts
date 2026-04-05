// src/command/select.ts
import * as app from "../my-mind.js";
import Command, { isMac } from "./command.js";
import Item, { ChildItem } from "../item.js";
import { Direction } from "../layout/layout.js";


new (class Select extends Command {
	keys = [
		{code: "ArrowLeft",  ctrlKey: false, shiftKey: false},
		{code: "ArrowUp",    ctrlKey: false, shiftKey: false},
		{code: "ArrowRight", ctrlKey: false, shiftKey: false},
		{code: "ArrowDown",  ctrlKey: false, shiftKey: false}
	];

	constructor() { super("select", "Move selection"); }

	execute(e: KeyboardEvent) {
		const dirs: Record<string, Direction> = {
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
	keys = [
		{code: "ArrowLeft",  ctrlKey: false, shiftKey: true},
		{code: "ArrowUp",    ctrlKey: false, shiftKey: true},
		{code: "ArrowRight", ctrlKey: false, shiftKey: true},
		{code: "ArrowDown",  ctrlKey: false, shiftKey: true}
	];

	constructor() { super("select-add", "Add to selection"); }

	execute(e: KeyboardEvent) {
		const dirs: Record<string, Direction> = {
			"ArrowLeft": "left",
			"ArrowUp": "top",
			"ArrowRight": "right",
			"ArrowDown": "bottom"
		};
		const dir = dirs[e.code];

		// Start from the current selection cursor (or currentItem if none yet)
		const from = app.selectionCursor ?? app.currentItem;
		const layout = from.resolvedLayout;
		const next = layout.pick(from, dir);

		// Boundary reached: pick() returned the same item
		if (next === from) { return; }

		app.extendSelection(next);
		app.currentMap.ensureItemVisibility(next);
	}

});

new (class SelectRoot extends Command {
	keys = [{code:"Home"}];

	constructor() { super("select-root", "Select root"); }

	execute() {
		let item = app.currentItem;
		while (!item.isRoot) { item = (item as ChildItem).parent; }
		app.selectItem(item);
	}
});

// Macs use "Backspace" to delete instead
if (!isMac()) {
	new (class SelectParent extends Command {
		keys = [{code:"Backspace"}];

		constructor() { super("select-parent", "Select parent"); }

		execute() {
			if (app.currentItem.isRoot) { return; }
			app.selectItem(app.currentItem.parent as Item);
		}
	});
}
