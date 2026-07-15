import * as app from "../my-mind.js";
import * as pubsub from "../pubsub.js";
const node = document.querySelector("#notes");
const iframe = node.querySelector("iframe");
// 背景プレビュー要素を作成
const previewEl = document.createElement("div");
previewEl.id = "note-preview";
previewEl.hidden = true;
previewEl.innerHTML = '<div id="note-preview-inner"></div>';
document.querySelector("main").appendChild(previewEl);
const previewInner = previewEl.querySelector("#note-preview-inner");
function sendToEditor(content) {
  var _a;
  (_a = iframe.contentWindow) === null || _a === void 0
    ? void 0
    : _a.postMessage({ action: "setContent", value: content }, "*");
}
function updatePreview(notes) {
  var _a, _b;
  const text =
    (_a = notes === null || notes === void 0 ? void 0 : notes.trim()) !==
      null && _a !== void 0
      ? _a
      : "";
  if (text) {
    (_b = iframe.contentWindow) === null || _b === void 0
      ? void 0
      : _b.postMessage({ action: "renderMarkdown", value: text }, "*");
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
  if (node.hidden) {
    return;
  }
  node.hidden = true;
}
function onMessage(e) {
  var _a;
  if (!((_a = e.data) === null || _a === void 0 ? void 0 : _a.action)) {
    return;
  }
  switch (e.data.action) {
    case "renderedMarkdown":
      previewInner.innerHTML = e.data.value;
      break;
    case "setContent":
      app.currentItem.notes = e.data.value.trim();
      updatePreview(app.currentItem.notes);
      pubsub.publish("item-change", app.currentItem); // trigger auto-save
      break;
    case "getContent":
      if (app.currentItem) {
        sendToEditor(app.currentItem.notes);
      }
      break;
    case "closeEditor":
      close();
      break;
  }
}
export function init() {
  pubsub.subscribe("item-select", (_message, publisher) => {
    sendToEditor(publisher.notes);
    updatePreview(publisher.notes);
  });
  window.addEventListener("message", onMessage);
}
