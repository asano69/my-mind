import Item from "../item.js";
import * as app from "../my-mind.js";
import * as pubsub from "../pubsub.js";

const node = document.querySelector<HTMLElement>("#notes")!;
const iframe = node.querySelector<HTMLIFrameElement>("iframe")!;

// 簡易Markdownレンダラー
function renderMarkdown(md: string): string {
    return md
        // 画像・リンクを先に処理（エスケープ前）
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        // エスケープ（タグ以外の & < > を対象に）
        .replace(/&(?![a-zA-Z]+;)/g, "&amp;")
        // 見出し
        .replace(/^### (.+)$/gm, "<h3>$1</h3>")
        .replace(/^## (.+)$/gm, "<h2>$1</h2>")
        .replace(/^# (.+)$/gm, "<h1>$1</h1>")
        // 太字・斜体
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        // インラインコード
        .replace(/`(.+?)`/g, "<code>$1</code>")
        // リスト
        .replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>")
        .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
        // 改行
        .replace(/\n{2,}/g, "</p><p>")
        .replace(/\n/g, "<br>");
}

// 背景プレビュー要素を作成
const previewEl = document.createElement('div');
previewEl.id = 'note-preview';
previewEl.hidden = true;
previewEl.innerHTML = '<div id="note-preview-inner"></div>';
document.querySelector('main')!.appendChild(previewEl);

const previewInner = previewEl.querySelector<HTMLElement>('#note-preview-inner')!;

function sendToEditor(content: string) {
    iframe.contentWindow && iframe.contentWindow.postMessage({
        action: "setContent",
        value: content
    }, "*");
}

function updatePreview(notes: string) {
    const text = notes ? notes.trim() : '';
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
    if (!e.data || !e.data.action) { return; }
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

