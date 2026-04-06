// src/command/edit.ts
import * as app from "../my-mind.js";
import Action, * as actions from "../action.js";
import * as notes from "../ui/notes.js";
import * as help from "../ui/help.js";
import * as io from "../ui/io.js";
import Command, { repo as commandRepo } from "./command.js";
import Item, { ChildItem, Status } from "../item.js";


new (class Edit extends Command {
	keys = [
		{code:"Space"},
		{code:"F2"}
	];

	constructor() { super("edit", "Edit item"); }

	execute() { app.startEditing(); }
});

new (class Finish extends Command {
	keys = [{code:"Enter", altKey:false, ctrlKey:false, shiftKey:false}];
	editMode = true;

	constructor() { super("finish", "Finish editing"); }

	execute() {
		let text = app.stopEditing();
		let action: Action;
		if (text) {
			action = new actions.SetText(app.currentItem, text);
		} else {
			action = new actions.RemoveItem(app.currentItem as ChildItem);
		}
		app.action(action);
	}
});

new (class Newline extends Command {
	keys = [
		{code:"Enter", shiftKey:true},
		{code:"Enter", ctrlKey:true}
	];
	editMode = true;

	constructor() { super("newline", "Line break"); }

	execute() {
		let range = getSelection()!.getRangeAt(0);
		let br = document.createElement("br");
		range.insertNode(br);
		range.setStartAfter(br);
		app.currentItem.update({parent:true, children:true});
	}
});

new (class Cancel extends Command {
	keys = [{code:"Escape"}];
	editMode = null;

	constructor() { super("cancel", "Cancel"); }

	execute() {
		if (app.editing) {
			app.stopEditing();
			var oldText = app.currentItem.text;
			if (!oldText) { // newly added node
				var action = new actions.RemoveItem(app.currentItem as ChildItem);
				app.action(action);
			}
		} else {
			// Clear multi-selection before closing panels
			app.clearMultiSelection();
			notes.close();
			help.close();
			io.hide();
		}
	}
});

// ---------------------------------------------------------------------------
// Text style helpers
// ---------------------------------------------------------------------------

// All tag variants that each execCommand may produce across browsers.
// e.g. bold -> <b> in Chrome, <strong> in some older browsers.
// strikeThrough -> <s> or <strike> depending on browser.
const STYLE_TAGS: Record<string, string[]> = {
	bold:          ["b", "strong"],
	italic:        ["i", "em"],
	underline:     ["u"],
	strikeThrough: ["s", "strike"],
};

// The canonical (first) tag used when adding the style
const STYLE_TAG_PRIMARY: Record<string, string> = {
	bold:          "b",
	italic:        "i",
	underline:     "u",
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
function toggleStyleTag(html: string, tags: string[], primaryTag: string): string {
	// Build a combined regex that matches any open or close alias tag
	const tagPattern = tags.map(t => `${t}`).join("|");
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
function applyStyleToItem(item: Item, command: string): Action {
	const tags = STYLE_TAGS[command];
	const primary = STYLE_TAG_PRIMARY[command];
	const newText = toggleStyleTag(item.text, tags, primary);
	return new actions.SetText(item, newText);
}

abstract class Style extends Command {
	editMode = null;
	command!: string;

	execute() {
		if (app.editing) {
			// Single-item edit mode: use execCommand for cursor-aware formatting
			document.execCommand(this.command, false);
			return;
		}

		const selected = app.getAllSelected();
		if (selected.length > 1) {
			// Multi-selection: apply style to every selected item as one undo step
			const subactions = selected.map(item => applyStyleToItem(item, this.command));
			app.action(new actions.Multi(subactions));
		} else {
			// Single item (no multi-selection): use the original execCommand path
			// so that partial-text selection inside a node still works
			commandRepo.get("edit")!.execute();
			let selection = getSelection()!;
			let range = selection.getRangeAt(0);
			range.selectNodeContents(app.currentItem.dom.text);
			selection.removeAllRanges();
			selection.addRange(range);
			document.execCommand(this.command, false);
			commandRepo.get("finish")!.execute();
		}
	}
}

new (class Bold extends Style {
	keys = [{code:"KeyB", ctrlKey:true}];
	command = "bold";

	constructor() { super("bold", "Bold"); }
});

new (class Underline extends Style {
	keys = [{code:"KeyU", ctrlKey:true}];
	command = "underline";

	constructor() { super("underline", "Underline"); }
});

new (class Italic extends Style {
	keys = [{code:"KeyI", ctrlKey:true}];
	command = "italic";

	constructor() { super("italic", "Italic"); }
});

new (class Strikethrough extends Style {
	keys = [{code:"KeyS", ctrlKey:true}];
	command = "strikeThrough";

	constructor() { super("strikethrough", "Strike-through"); }
});

new (class Value extends Command {
	keys = [{key:"v", ctrlKey:false, metaKey:false}];

	constructor() { super("value", "Set value"); }

	execute() {
		let item = app.currentItem;
		let oldValue = item.value;
		let newValue = prompt("Set item value", String(oldValue));
		if (newValue == null) { return; }

		if (!newValue.length) { newValue = null; }

		let numValue = Number(newValue);
		let action = new actions.SetValue(item, isNaN(numValue) ? newValue : numValue);
		app.action(action);
	}
});

new (class Yes extends Command {
	keys = [{key:"y", ctrlKey:false}];

	constructor() { super("yes", "Yes"); }

	execute() {
		// Apply to all selected items: toggle based on currentItem's current status
		const current = app.currentItem;
		const newStatus = (current.status === true ? null : true);
		const subactions = app.getAllSelected().map(
			item => new actions.SetStatus(item, newStatus)
		);
		app.action(subactions.length === 1 ? subactions[0] : new actions.Multi(subactions));
	}
});

new (class No extends Command {
	keys = [{key:"n", ctrlKey:false}];

	constructor() { super("no", "No"); }

	execute() {
		const current = app.currentItem;
		const newStatus = (current.status === false ? null : false);
		const subactions = app.getAllSelected().map(
			item => new actions.SetStatus(item, newStatus)
		);
		app.action(subactions.length === 1 ? subactions[0] : new actions.Multi(subactions));
	}
});

new (class Computed extends Command {
	keys = [{key:"c", ctrlKey:false, metaKey:false}];

	constructor() { super("computed", "Computed"); }

	execute() {
		let item = app.currentItem;
		let status: Status = (item.status == "computed" ? null : "computed");
		let action = new actions.SetStatus(item, status);
		app.action(action);
	}
});
