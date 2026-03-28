// src/ui/notes.ts
import Item from "../item.js";
import * as app from "../my-mind.js";
import * as pubsub from "../pubsub.js";

const node = document.querySelector<HTMLElement>("#notes")!;
const iframe = node.querySelector<HTMLIFrameElement>("iframe")!;

// 背景プレビュー要素を作成
const previewEl = document.createElement('div');
previewEl.id = 'note-preview';
previewEl.hidden = true;
previewEl.innerHTML = '<div id="note-preview-inner"></div>';
document.querySelector('main')!.appendChild(previewEl);
const previewInner = previewEl.querySelector<HTMLElement>('#note-preview-inner')!;

function sendToEditor(content: string) {
    iframe.contentWindow?.postMessage({ action: "setContent", value: content }, "*");
}

function updatePreview(notes: string) {
    const text = notes?.trim() ?? '';
    if (text) {
        iframe.contentWindow?.postMessage({ action: "renderMarkdown", value: text }, "*");
        previewEl.hidden = false;
    } else {
        previewEl.hidden = true;
    }
}

export function toggle() {
    node.hidden = !node.hidden;
    if (!node.hidden && app.currentItem) {
        sendToEditor(app.currentItem.notes);
    }
}

export function close() {
    if (node.hidden) { return; }
    node.hidden = true;
}

function onMessage(e: MessageEvent) {
    if (!e.data?.action) { return; }
    switch (e.data.action) {
        case "renderedMarkdown":
            previewInner.innerHTML = e.data.value;
            break;
        case "setContent":
            app.currentItem.notes = e.data.value.trim();
            updatePreview(app.currentItem.notes);
            break;
        case "getContent":
            if (app.currentItem) { sendToEditor(app.currentItem.notes); }
            break;
        case "closeEditor":
            close();
            break;
    }
}

export function init() {
    pubsub.subscribe("item-select", (_message: string, publisher: Item) => {
        sendToEditor(publisher.notes);
        updatePreview(publisher.notes);
    });
    window.addEventListener("message", onMessage);
}
