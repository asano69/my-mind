// src/my-mind.ts
import Map, { init as initMap } from "./map.js";
import Item from "./item.js";
import Action from "./action.js";
import * as pubsub from "./pubsub.js";
import * as keyboard from "./keyboard.js";
import * as mouse from "./mouse.js";
import * as history from "./history.js";
import * as clipboard from "./clipboard.js";
import * as title from "./title.js";
import * as ui from "./ui/ui.js";
import { repo as commandRepo } from "./command/command.js";
import "./command/select.js";
import "./command/edit.js";
const port = document.querySelector<HTMLElement>("main")!;
export let currentMap: Map;
export let currentItem: Item;
export let editing = false;

// Additional items selected via Ctrl/Cmd+click (does not include currentItem)
export let selectedItems = new Set<Item>();

export function showMap(map: Map) {
	currentMap && currentMap.hide();
	history.reset();
	currentMap = map;
	currentMap.show(port);
}
export function action(action: Action) {
	history.push(action);
	action.do();
}

/** Clear all items in the multi-selection, restoring their visual state. */
export function clearMultiSelection() {
	selectedItems.forEach(i => i.unmarkSelected());
	selectedItems.clear();
}

/**
 * Toggle an item in/out of the multi-selection.
 * Has no effect on the primary currentItem.
 */
export function addToSelection(item: Item) {
	if (item === currentItem) { return; }
	if (selectedItems.has(item)) {
		selectedItems.delete(item);
		item.unmarkSelected();
	} else {
		selectedItems.add(item);
		item.markSelected();
	}
}

/** Returns all selected items: [currentItem, ...selectedItems]. */
export function getAllSelected(): Item[] {
	const items: Item[] = [currentItem];
	selectedItems.forEach(i => items.push(i));
	return items;
}

export function selectItem(item: Item) {
	clearMultiSelection();
	if (currentItem && currentItem != item) {
		if (editing) { commandRepo.get("finish")!.execute(); }
		currentItem.deselect();
	}
	currentItem = item;
	currentItem.select();
	currentMap.ensureItemVisibility(currentItem);
}
// removed: throbber element query (now using .spinner div)
export function setThrobber(visible: boolean) {
	document.querySelector<HTMLElement>(".spinner")!.hidden = !visible;
}
export function startEditing() {
	clearMultiSelection();
	editing = true;
	currentItem.startEditing();
}
export function stopEditing() {
	editing = false;
	return currentItem.stopEditing();
}
async function init() {
	setThrobber(true);
	await initMap();
	pubsub.subscribe("ui-change", syncPort);
	window.addEventListener("resize", syncPort);
	// TODO: re-enable beforeunload when auto-save is implemented
	// e.g. warn only if unsaved changes exist, or wait for save to complete before navigating away
	// window.addEventListener("beforeunload", e => {
	// 	e.preventDefault();
	// 	return "";
	// });
	clipboard.init();
	keyboard.init();
	mouse.init(port);
	title.init();
	ui.init(port);
	syncPort();
	showMap(new Map());
	setThrobber(false);
}
function syncPort() {
	let portSize = [window.innerWidth - ui.getWidth(), window.innerHeight];
	port.style.width = portSize[0] + "px";
	port.style.height = portSize[1] + "px";
	currentMap && currentMap.ensureItemVisibility(currentItem);
}
init();
