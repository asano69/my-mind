import Map from "./map.js";
import * as app from "./my-mind.js";
import * as ui from "./ui/ui.js";
import * as actions from "./action.js";
import { repo as formatRepo } from "./format/format.js";
import { isCanvasActive } from "./scope.js";

let storedItems = [];
let mode = "";
// Listened on `document` (capture phase), not containerEl. Unlike
// keydown, clipboard events (cut/copy/paste) target wherever the
// browser resolves the current Selection to be, not simply
// document.activeElement -- a plain non-editable, focused
// tabIndex="-1" div (containerEl) has no real Selection inside it, so
// the browser dispatches paste with target=document.body instead.
// Since containerEl is a descendant of body, not an ancestor, that
// event could never bubble up to a listener attached on containerEl,
// silently breaking paste until some unrelated action (e.g. editing a
// node) happened to leave a stray Selection behind. Listening on
// document sidesteps target resolution entirely; isCanvasActive() still
// gates it exactly the same as before.
export function init(containerEl) {
  document.addEventListener("cut", onCopyCut, true);
  document.addEventListener("copy", onCopyCut, true);
  document.addEventListener("paste", onPaste, true);
}
// Called by my-mind.js's unmount(). Also clears any cut-in-progress state
// so a remount does not resume an old cut/copy from the previous map.
export function dispose(containerEl) {
  document.removeEventListener("cut", onCopyCut, true);
  document.removeEventListener("copy", onCopyCut, true);
  document.removeEventListener("paste", onPaste, true);
  storedItems = [];
  mode = "";
}
function onCopyCut(e) {
  if (!isCanvasActive() || ui.isActive() || app.editing) {
    return;
  }
  e.preventDefault();
  endCut();
  // Operate on all selected items, excluding the root
  const selected = app.getAllSelected().filter((i) => !i.isRoot);
  if (selected.length === 0) {
    return;
  }
  switch (e.type) {
    case "copy":
      storedItems = selected.map((i) => i.clone());
      break;
    case "cut":
      storedItems = selected;
      storedItems.forEach((i) => i.dom.node.classList.add("cut"));
      break;
    default:
      return; // TS needs non-null storedItems
  }
  // Set clipboard text from the first stored item for system clipboard compatibility
  let json = storedItems[0].toJSON();
  let plaintext = formatRepo.get("plaintext").to(json);
  e.clipboardData.setData("text/plain", plaintext);
  mode = e.type;
}
function onPaste(e) {
  if (!isCanvasActive() || ui.isActive() || app.editing) {
    return;
  }
  e.preventDefault();
  let pasted = e.clipboardData.getData("text/plain");
  if (!pasted) {
    return;
  }
  if (storedItems.length > 0) {
    // For a single stored item, verify the clipboard text to detect external pastes
    const isInternal =
      storedItems.length > 1 ||
      pasted === formatRepo.get("plaintext").to(storedItems[0].toJSON());
    if (isInternal) {
      pasteItems(storedItems, app.currentItem);
    } else {
      pastePlaintext(pasted, app.currentItem);
    }
  } else {
    pastePlaintext(pasted, app.currentItem);
  }
  endCut();
}
function pasteItems(items, targetItem) {
  let subactions;
  switch (mode) {
    case "cut":
      {
        const validItems = items.filter((item) => {
          // Prevent moving to self, to current parent, or to own descendant
          if (item === targetItem || item.parent === targetItem) {
            return false;
          }
          let node = targetItem;
          while (true) {
            if (node === item) {
              return false;
            }
            if (node.parent instanceof Map) {
              break;
            }
            node = node.parent;
          }
          return true;
        });
        if (validItems.length === 0) {
          return;
        }
        subactions = validItems.map(
          (item) => new actions.MoveItem(item, targetItem),
        );
      }
      break;
    case "copy":
      // Clone each item so repeated pastes each get an independent copy
      subactions = items.map(
        (item) => new actions.AppendItem(targetItem, item.clone()),
      );
      break;
    default:
      return;
  }
  app.action(
    subactions.length === 1 ? subactions[0] : new actions.Multi(subactions),
  );
}
function pastePlaintext(plaintext, targetItem) {
  let json = formatRepo.get("plaintext").from(plaintext);
  let map = Map.fromJSON(json);
  let root = map.root;
  if (root.text) {
    let action = new actions.AppendItem(targetItem, root);
    app.action(action);
  } else {
    let subactions = root.children.map(
      (item) => new actions.AppendItem(targetItem, item),
    );
    let action = new actions.Multi(subactions);
    app.action(action);
  }
}
function endCut() {
  if (mode != "cut") {
    return;
  }
  storedItems.forEach((i) => i.dom.node.classList.remove("cut"));
  storedItems = [];
  mode = "";
}
