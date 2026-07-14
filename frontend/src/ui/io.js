// src/ui/io.ts
import * as pubsub from "../pubsub.js";
import * as app from "../my-mind.js";
import { repo } from "./backend/backend.js";
import Local from "./backend/local.js";
import File from "./backend/file.js";
import WebDAV from "./backend/webdav.js";
import Image from "./backend/image.js";
let currentMode = "load";
let currentBackend = null;
let autoSaveTimeout = null;
let lastSaveTime = null;
const node = document.querySelector("#io");
const select = node.querySelector("#backend");
const PREFIX = "mm.app";
const AUTO_SAVE_DELAY_MS = 3000;
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
        if (e.key === "Escape") {
            hide();
        }
    });
    pubsub.subscribe("map-new", _ => setCurrentBackend(null));
    pubsub.subscribe("save-done", onDone);
    pubsub.subscribe("load-done", onDone);
    // Track last save time and refresh the elapsed-time display every 10s.
    pubsub.subscribe("save-done", () => {
        lastSaveTime = Date.now();
        updateSaveStatus();
    });
    setInterval(updateSaveStatus, 1000);
    // Auto-save: debounce item changes and save after a short delay.
    pubsub.subscribe("item-change", () => {
        if (!currentBackend) {
            return;
        }
        if (autoSaveTimeout !== null) {
            clearTimeout(autoSaveTimeout);
        }
        autoSaveTimeout = setTimeout(() => {
            autoSaveTimeout = null;
            currentBackend === null || currentBackend === void 0 ? void 0 : currentBackend.save();
        }, AUTO_SAVE_DELAY_MS);
    });
}
function onDone(_message, publisher) {
    hide();
    setCurrentBackend(publisher);
}
export function restore() {
    let parts = {};
    // /m/filename.mymind パス形式を処理
    const pathMatch = location.pathname.match(/^\/m\/(.+)$/);
    if (pathMatch) {
        parts.url = decodeURIComponent(pathMatch[1]);
        parts.b = "webdav";
    }
    else {
        // クエリパラメータを処理（?f= を優先、?url= は後方互換）
        location.search.substring(1).split("&").forEach(item => {
            let keyvalue = item.split("=").map(decodeURIComponent);
            parts[keyvalue[0]] = keyvalue[1];
        });
        if ("map" in parts) {
            parts.url = parts.map;
        }
        if ("f" in parts) {
            parts.url = parts.f;
        } // ?f= 対応
        if ("url" in parts && !("b" in parts)) {
            parts.b = "webdav";
        }
    }
    let backend = repo.get(parts.b);
    if (backend) {
        backend.setState(parts);
        return;
    }
    app.setThrobber(false);
}
export function show(mode) {
    currentMode = mode;
    node.hidden = false;
    node.querySelector("h3").textContent = mode;
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
            const input = node.querySelector(".filename");
            if (!input) {
                return;
            }
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
    var _a;
    if (node.contains(document.activeElement)) {
        (_a = document.activeElement) === null || _a === void 0 ? void 0 : _a.blur();
    }
    node.hidden = true;
}
export function quickSave() {
    if (currentBackend) {
        currentBackend.save();
    }
    else {
        show("save");
    }
}
function syncBackend() {
    [...node.querySelectorAll("div[id]")].forEach(node => node.hidden = true);
    node.querySelector(`#${select.value}`).hidden = false;
    repo.get(select.value).show(currentMode);
}
function setCurrentBackend(backend) {
    if (currentBackend && currentBackend != backend) {
        currentBackend.reset();
    }
    if (backend) {
        localStorage.setItem(`${PREFIX}.backend`, backend.id);
    }
    currentBackend = backend;
    try {
        updateURL(); // fails when on file:///
    }
    catch (e) { }
}
function updateURL() {
    let data = currentBackend && currentBackend.getState();
    if (!data || !data.url) {
        history.replaceState(null, "", "/");
    }
    else {
        // /m/filename.mymind 形式で表現できる場合はパスベースURLに
        const filename = data.url;
        if (filename && !filename.includes("/") && filename.endsWith(".mymind")) {
            history.replaceState(null, "", `/m/${encodeURIComponent(filename)}`);
        }
        else {
            // サブディレクトリ付きなどはフォールバック
            let arr = Object.entries(data).map(pair => pair.map(encodeURIComponent).join("="));
            history.replaceState(null, "", "?" + arr.join("&"));
        }
    }
}
function updateSaveStatus() {
    const el = document.getElementById("save-status");
    if (!el) {
        return;
    }
    if (lastSaveTime === null) {
        el.textContent = "";
        return;
    }
    const elapsed = Math.floor((Date.now() - lastSaveTime) / 1000);
    if (elapsed < 2) {
        el.textContent = "just saved!";
    }
    else if (elapsed < 5) {
        el.textContent = "<5s ago";
    }
    else if (elapsed < 10) {
        el.textContent = "<10s ago";
    }
    else if (elapsed < 60) {
        el.textContent = `${Math.floor(elapsed / 10) * 10}s ago`;
    }
    else {
        el.textContent = `${Math.floor(elapsed / 60)}m ago`;
    }
}
