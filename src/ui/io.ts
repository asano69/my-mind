// src/ui/io.ts
import * as pubsub from "../pubsub.js";
import * as app from "../my-mind.js";
import { Mode, repo } from "./backend/backend.js";

import BackendUI from "./backend/backend.js";
import Local from "./backend/local.js";
import File from "./backend/file.js";
import WebDAV from "./backend/webdav.js";
import Image from "./backend/image.js";




type BUI = BackendUI<any>;

let currentMode: Mode = "load";
let currentBackend: BUI | null = null;

const node = document.querySelector<HTMLElement>("#io")!;
const select = node.querySelector<HTMLSelectElement>("#backend")!;
const PREFIX = "mm.app";

export function isActive() {
    return !node.hidden && node.contains(document.activeElement);
}

export function init() {
	[Local, File, WebDAV, Image].forEach(ctor => {
		let bui = new ctor();
		select.append(bui.option);
	});
	select.value = localStorage.getItem(`${PREFIX}.backend`) || "webdav";
	select.addEventListener("change", syncBackend);
	node.addEventListener("keydown", e => {
		if (e.key === "Escape") { hide(); }
	});
	pubsub.subscribe("map-new", _ => setCurrentBackend(null));
	pubsub.subscribe("save-done", onDone);
	pubsub.subscribe("load-done", onDone);
}


function onDone(_message: string, publisher?: any) {
	hide();
	setCurrentBackend(publisher);
}

export function restore() {
	let parts: Record<string, string> = {};

	// /m/filename.mymind パス形式を処理
	const pathMatch = location.pathname.match(/^\/m\/(.+)$/);
	if (pathMatch) {
		parts.url = decodeURIComponent(pathMatch[1]);
		parts.b = "webdav";
	} else {
		// クエリパラメータを処理（?f= を優先、?url= は後方互換）
		location.search.substring(1).split("&").forEach(item => {
			let keyvalue = item.split("=").map(decodeURIComponent);
			parts[keyvalue[0]] = keyvalue[1];
		});
		if ("map" in parts) { parts.url = parts.map; }
		if ("f" in parts) { parts.url = parts.f; }           // ?f= 対応
		if ("url" in parts && !("b" in parts)) { parts.b = "webdav"; }
	}

	let backend = repo.get(parts.b);
	if (backend) {
		backend.setState(parts);
		return;
	}
	app.setThrobber(false);
}

export function show(mode: Mode) {
	currentMode = mode;
	node.hidden = false;
	node.querySelector("h3")!.textContent = mode;
	syncBackend();
	if (mode === "load") {
		// Focus the filename input so the user can type immediately.
		//requestAnimationFrame(() => {
		//    const input = node.querySelector<HTMLInputElement>(".filename");
		//    if (input) {
		//        input.value = "";
		//        input.focus();
		//    }
		//});
    requestAnimationFrame(() => {
        const input = node.querySelector<HTMLInputElement>(".filename");
        if (!input) { return; }
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        input.value = `${yy}${mm}${dd}`;
        input.focus();
        input.select();
    });




	}
}


export function hide() {
    if (node.contains(document.activeElement)) {
        (document.activeElement as HTMLElement)?.blur();
    }
    node.hidden = true;
}

export function quickSave() {
	if (currentBackend) {
		currentBackend.save();
	} else {
		show("save");
	}
}

function syncBackend() {
	[...node.querySelectorAll<HTMLElement>("div[id]")].forEach(node => node.hidden = true);
	node.querySelector<HTMLElement>(`#${select.value}`)!.hidden = false;
	repo.get(select.value)!.show(currentMode);
}

function setCurrentBackend(backend: BUI | null) {
	if (currentBackend && currentBackend != backend) { currentBackend.reset(); }

	if (backend) { localStorage.setItem(`${PREFIX}.backend`, backend.id); }
	currentBackend = backend;
	try {
		updateURL(); // fails when on file:///
	} catch (e) {}
}

function updateURL() {
	let data = currentBackend && currentBackend.getState() as Record<string, string>;
	if (!data || !data.url) {
		history.replaceState(null, "", "/");
	} else {
		// /m/filename.mymind 形式で表現できる場合はパスベースURLに
		const filename = data.url;
		if (filename && !filename.includes("/") && filename.endsWith(".mymind")) {
			history.replaceState(null, "", `/m/${encodeURIComponent(filename)}`);
		} else {
			// サブディレクトリ付きなどはフォールバック
			let arr = Object.entries(data).map(pair => pair.map(encodeURIComponent).join("="));
			history.replaceState(null, "", "?" + arr.join("&"));
		}
	}
}
