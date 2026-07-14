// src/title.ts
import * as pubsub from "./pubsub.js";
import { currentMap } from "./my-mind.js";
function onItemChange(_message, publisher) {
  if (publisher.isRoot && publisher.map == currentMap) {
    document.title = currentMap.name + "";
  }
}
export function init() {
  pubsub.subscribe("item-change", onItemChange);
}
