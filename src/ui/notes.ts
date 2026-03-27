import Item from "../item.js";
import * as app from "../my-mind.js";
import * as pubsub from "../pubsub.js";

const node = document.querySelector<HTMLElement>("#notes")!;
const iframe = node.querySelector<HTMLIFrameElement>("iframe")!;

function sendToEditor(content: string) {
    iframe.contentWindow && iframe.contentWindow.postMessage({
        action: "setContent",
        value: content
    }, "*");
}

export function toggle() {
    node.hidden = !node.hidden;
    // パネルを開いたとき、現在のアイテムの内容を送る
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
        break;
        case "getContent":
            // editor.htmlからのリクエストにも応答
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
    });
    window.addEventListener("message", onMessage);
}
