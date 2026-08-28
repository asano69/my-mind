// newClipboard.js — clipboard (cut/copy/paste) for the ?newEngine=1
// preview.
//
// Phase 4.8 of docs/08-phase4-mindmap-engine-refactor.md. Ported from
// clipboard.js: listens on `document`'s capture phase for cut/copy/
// paste events, not on any container element -- see
// docs/d01-clipboard-event-targeting.md for why (cut/copy/paste target
// wherever the browser resolves the current Selection to be, not
// document.activeElement, so a container-scoped listener can silently
// miss these events). That reasoning is DOM/browser-level and
// independent of which engine owns the tree, so the listening location
// is kept unchanged.
//
// Tree construction/serialization goes through ItemNode (itemStore.js)
// and format/plaintext.js's existing converter -- both already work
// against ItemNode's public API (toJSON/fromJSON/clone, see itemStore.js's
// Phase 1 note), so no new format logic is needed here. Tree mutation
// goes through newAction.js's action()/MoveItem/AppendItem/Multi (Phase
// 4.6), so a completed cut/paste is a real undo/redo step.
//
// item.dom dependency in the old clipboard.js is limited to toggling a
// ".cut" CSS class on the dragged-out items -- see
// docs/08-phase4-mindmap-engine-refactor.md's dependency inventory,
// section 3. That's sourced through the domRefs registry (Phase 4.1)
// here instead, passed in via init(domRefs).
import ItemNode from "./itemStore.js";
import { isCanvasActive } from "./scope.js";
import { currentItem, selectedItems, editing } from "./itemSelection.js";
import { action, MoveItem, AppendItem, Multi } from "./newAction.js";
import { repo as formatRepo } from "./format/format.js";
// Side-effect import: registers the "plaintext" format into
// format.js's repo (see format/plaintext.js's `new Plaintext()` call at
// the bottom of that file). Nothing else in the new engine imports
// plaintext.js -- the old engine's my-mind.js used to be the thing that
// pulled it in as a side effect -- so without this import,
// formatRepo.get("plaintext") below is undefined and every cut/copy/
// paste throws a TypeError.
import "./format/plaintext.js";

// All currently selected items (currentItem plus any multi-selection),
// mirroring my-mind.js's getAllSelected() -- itemSelection.js exposes
// the underlying signals but no combined getter of its own. Stateless
// (only reads itemSelection.js's own signals), so it stays a plain
// top-level helper instead of living inside the controller below.
function getAllSelectedItems() {
  const all = [currentItem()];
  selectedItems().forEach((item) => all.push(item));
  return all;
}

// Builds and dispatches the action for pasting a plain-text (i.e. not
// this file's own internal cut/copy) clipboard payload into targetItem,
// via format/plaintext.js's converter. Stateless -- doesn't touch this
// file's cut/copy bookkeeping, so it stays outside
// createClipboardController() below, unlike pasteItems() (which needs
// the controller's own `mode`).
function pastePlaintext(plaintext, targetItem) {
  const json = formatRepo.get("plaintext").from(plaintext);
  const root = ItemNode.fromJSON(json.root);
  if (root.text) {
    action(new AppendItem(targetItem, root));
  } else {
    const subactions = root.children.map(
      (item) => new AppendItem(targetItem, item),
    );
    action(new Multi(subactions));
  }
}

// --- Stateful controller (Step 5, docs/mind-map-core-engine-library/01-plan.md) ---
// createClipboardController() closes the per-instance mutable cut/copy
// state (storedItems, mode, domRefsRef) that used to live as bare
// module-level `let`s, so a future multi-instance host can create N
// independent controllers. The default singleton instance below
// preserves every existing `import * as newClipboard from
// "./newClipboard.js"` call site unchanged.
export function createClipboardController() {
  let storedItems = [];
  let mode = "";
  let domRefsRef = null;

  // See this file's header comment (and docs/d01-clipboard-event-targeting.md)
  // for why this listens on `document`'s capture phase instead of a
  // container element. `domRefs` is only needed for the cut-visual class
  // toggle below; pass null/omit if that's not needed by the caller.
  function init(domRefs = null) {
    domRefsRef = domRefs;
    document.addEventListener("cut", onCopyCut, true);
    document.addEventListener("copy", onCopyCut, true);
    document.addEventListener("paste", onPaste, true);
  }

  // Called on unmount. Also clears any cut-in-progress state so a remount
  // does not resume an old cut/copy from a previous map.
  function dispose() {
    document.removeEventListener("cut", onCopyCut, true);
    document.removeEventListener("copy", onCopyCut, true);
    document.removeEventListener("paste", onPaste, true);
    storedItems = [];
    mode = "";
    domRefsRef = null;
  }

  function onCopyCut(e) {
    if (!isCanvasActive() || editing()) {
      return;
    }
    e.preventDefault();
    endCut();
    // Operate on all selected items, excluding the root.
    const selected = getAllSelectedItems().filter((i) => i && !i.isRoot);
    if (selected.length === 0) {
      return;
    }
    switch (e.type) {
      case "copy":
        storedItems = selected.map((i) => i.clone());
        break;
      case "cut":
        storedItems = selected;
        storedItems.forEach((i) => domRefsRef?.get(i.id)?.classList.add("cut"));
        break;
      default:
        return;
    }
    // Set clipboard text from the first stored item for system clipboard
    // compatibility.
    const json = storedItems[0].toJSON();
    const plaintext = formatRepo.get("plaintext").to(json);
    e.clipboardData.setData("text/plain", plaintext);
    mode = e.type;
  }

  function onPaste(e) {
    if (!isCanvasActive() || editing()) {
      return;
    }
    e.preventDefault();
    const pasted = e.clipboardData.getData("text/plain");
    if (!pasted) {
      return;
    }
    const target = currentItem();
    if (!target) {
      return;
    }
    if (storedItems.length > 0) {
      // For a single stored item, verify the clipboard text to detect
      // external pastes.
      const isInternal =
        storedItems.length > 1 ||
        pasted === formatRepo.get("plaintext").to(storedItems[0].toJSON());
      if (isInternal) {
        pasteItems(storedItems, target);
      } else {
        pastePlaintext(pasted, target);
      }
    } else {
      pastePlaintext(pasted, target);
    }
    endCut();
  }

  function pasteItems(items, targetItem) {
    let subactions;
    switch (mode) {
      case "cut": {
        const validItems = items.filter((item) => {
          // Prevent moving to self, to current parent, or to own descendant.
          if (item === targetItem || item.parent === targetItem) {
            return false;
          }
          let node = targetItem;
          while (true) {
            if (node === item) {
              return false;
            }
            if (node.isRoot) {
              break;
            }
            node = node.parent;
          }
          return true;
        });
        if (validItems.length === 0) {
          return;
        }
        subactions = validItems.map((item) => new MoveItem(item, targetItem));
        break;
      }
      case "copy":
        // Clone each item so repeated pastes each get an independent copy.
        subactions = items.map(
          (item) => new AppendItem(targetItem, item.clone()),
        );
        break;
      default:
        return;
    }
    action(subactions.length === 1 ? subactions[0] : new Multi(subactions));
  }

  function endCut() {
    if (mode != "cut") {
      return;
    }
    storedItems.forEach((i) => domRefsRef?.get(i.id)?.classList.remove("cut"));
    storedItems = [];
    mode = "";
  }

  return { init, dispose };
}

// Default singleton instance, preserving the current module-level API
// during the migration -- every existing `import * as newClipboard from
// "./newClipboard.js"` call site keeps working unchanged. Once callers
// (NewMindMapPreview.jsx, ...) are threaded through an explicit
// instance instead, this default export can be dropped.
const defaultInstance = createClipboardController();
export const { init, dispose } = defaultInstance;
