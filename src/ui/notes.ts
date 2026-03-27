import Item from "../item.js";
import * as app from "../my-mind.js";
import * as pubsub from "../pubsub.js";

declare const EasyMDE: any;

const node = document.querySelector<HTMLElement>("#notes")!;
const iframe = node.querySelector<HTMLIFrameElement>("iframe")!;

// 背景プレビュー要素を作成
const previewEl = document.createElement('div');
previewEl.id = 'note-preview';
previewEl.hidden = true;
previewEl.innerHTML = '<div id="note-preview-inner"></div>';
document.querySelector('main')!.appendChild(previewEl);
const previewInner = previewEl.querySelector<HTMLElement>('#note-preview-inner')!;

// EasyMDE 内蔵の marked でMarkdown→HTML変換
let _md: any = null;

function renderMarkdown(md: string): string {
    if (!_md) {
        const textarea = document.createElement('textarea');
        textarea.style.display = 'none';
        document.body.appendChild(textarea);
        _md = new EasyMDE({
            element: textarea,
            autoDownloadFontAwesome: false,
            toolbar: false,
            status: false,
        });
        // EasyMDEが生成したエディタUIを非表示に
        const wrap = textarea.nextElementSibling as HTMLElement | null;
        if (wrap) wrap.style.display = 'none';
    }
    return _md.markdown(md);
}
function sendToEditor(content: string) {
    iframe.contentWindow?.postMessage({ action: "setContent", value: content }, "*");
}

function updatePreview(notes: string) {
    const text = notes?.trim() ?? '';
    if (text) {
        previewInner.innerHTML = renderMarkdown(text);
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

