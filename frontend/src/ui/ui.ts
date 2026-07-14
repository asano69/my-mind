// src/ui/ui.ts
import * as pubsub from "../pubsub.js";
import * as app from "../my-mind.js";

import * as color from "./color.js";
import * as textColor from "./text-color.js";
import * as value from "./value.js";
import * as layout from "./layout.js";

import * as shape from "./shape.js";
import * as status from "./status.js";

import * as help from "./help.js";
import * as notes from "./notes.js";

import * as io from "./io.js";
import * as menu from "./context-menu.js";
import { repo as commandRepo } from "../command/command.js";


const node = document.querySelector<HTMLElement>("#ui")!;
const saveTimeEl = document.querySelector<HTMLElement>("#save-time")!;

// Timestamp of the last successful save (ms since epoch), or null if not yet saved.
let lastSaveTime: number | null = null;
let elapsedTimer: ReturnType<typeof setInterval> | null = null;

/** Format a Date as HH:MM:SS. */
function formatTime(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Format elapsed milliseconds as a human-readable string.
 *  <5s  → "now"
 *  <60s → "<1m"
 *  <60m → "Xm ago"
 *  else → "Xh ago"
 */
function formatElapsed(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 5)   { return "now"; }
    if (s < 60)  { return "<1m"; }
    const m = Math.floor(s / 60);
    if (m < 60)  { return `${m}m ago`; }
    const h = Math.floor(m / 60);
    return `${h}h ago`;
}

/** Refresh the elapsed portion of the save-time display. */
function refreshElapsed() {
    if (lastSaveTime === null || !saveTimeEl) { return; }
    const elapsed = Date.now() - lastSaveTime;
    const timeStr = formatTime(new Date(lastSaveTime));
    saveTimeEl.textContent = `${timeStr}  (${formatElapsed(elapsed)})`;
}

/** Called whenever a successful save completes. */
function onSaveDone() {
    lastSaveTime = Date.now();
    refreshElapsed();

    // Start the per-second ticker if not already running.
    if (!elapsedTimer) {
        elapsedTimer = setInterval(refreshElapsed, 1000);
    }
}

export function isActive() {
    const active = document.activeElement;
    const needsKeyboard = active instanceof HTMLInputElement
        || active instanceof HTMLSelectElement
        || active instanceof HTMLTextAreaElement;
    return (needsKeyboard && node.contains(active)) || io.isActive();
}

export function toggle() {
	node.hidden = !node.hidden;
	pubsub.publish("ui-change");
}

export function getWidth() {
	return (node.hidden ? 0 : node.offsetWidth);
}

function update() {
	[layout, shape, value, status].forEach(ui => ui.update());
}

function onClick(e: MouseEvent) {
	let target = e.target as HTMLElement;

	if (target == node.querySelector("#toggle")) { // fixme nelibi
		toggle();
		return;
	}

	let current: Element = target;
	while (true) {
		let command = (current as HTMLElement).dataset.command;
		if (command) {
			commandRepo.get(command)!.execute();
			return;
		}
		if (current.parentNode instanceof Element) {
			current = current.parentNode;
		} else {
			return;
		}
	}
}

export function init(port: HTMLElement) {
	[layout, shape, value, status, color, textColor,
	help, notes, io].forEach(ui => ui.init());
	menu.init(port);

	pubsub.subscribe("item-select", update);
	pubsub.subscribe("item-change", (_message: string, publisher: any) => {
		if (publisher == app.currentItem) { update(); }
	});
	pubsub.subscribe("save-done", onSaveDone);

	document.addEventListener("click", onClick);

	io.restore();
}
