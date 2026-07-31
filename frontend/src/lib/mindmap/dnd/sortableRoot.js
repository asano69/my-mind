// Phase 2 proof-of-concept for the dnd-kit refactor (see
// docs/07-dnd-kit-solid-refactor.md). Wires @dnd-kit/solid's useSortable
// onto the mind-map root's direct children only, using a single fixed
// group. This proves the drag-start -> reorder -> drop mechanism end to
// end before Phase 3 generalizes group ids to `parent.id` for every
// parent in the tree.
//
// Deliberately narrow scope for Phase 2:
// - Only the root's own children participate; every other node in the
//   tree is still dragged the old way, via mouse.js.
// - Only reordering within the root's children is supported. Moving a
//   child out to become someone else's child, or dropping into an empty
//   node, is Phase 3/4 work.
// - Left/right side (MapLayout) assignment is left untouched; a drag
//   only reorders position within whichever side bucket the item
//   already had (item.side is passed through unchanged to MoveItem).
import { createRoot, createEffect, on } from "solid-js";
import { useSortable } from "@dnd-kit/solid/sortable";
import { move } from "@dnd-kit/helpers";
import * as app from "../my-mind.js";
import * as actions from "../action.js";

export const GROUP = "root-children";

let disposeEffect = null;
let bindings = new Map(); // item id -> dispose fn

function bindChild(item, index) {
  createRoot((dispose) => {
    // A fresh binding is created every time rebind() runs (see below),
    // so a static `index` at creation time is fine here -- there is no
    // long-lived instance whose index needs to update in place yet.
    // Phase 3, which will stop rebinding the whole group on every
    // change, will need the reactive-getter form the docs describe
    // instead.
    const { ref } = useSortable({
      id: item.id,
      group: GROUP,
      accept: "item",
      type: "item",
      index,
      data: { group: GROUP },
    });
    ref(item.dom.content);
    bindings.set(item.id, dispose);
  });
}

function unbindAll() {
  bindings.forEach((dispose) => dispose());
  bindings.clear();
}

function rebind(root) {
  unbindAll();
  root.children.forEach((child, index) => bindChild(child, index));
}

// Called by my-mind.js's showMap() whenever a map becomes the current
// one (including on initial load and on "New map"/snapshot restore).
export function init(map) {
  if (!map) {
    return;
  }
  createRoot((dispose) => {
    disposeEffect = () => {
      unbindAll();
      dispose();
    };
    // map.root._childrenVersion is the same per-item signal item.js's
    // own layout memo reads (see item.js's computeLayout) -- reusing it
    // here, rather than adding a new signal, keeps this module a thin
    // consumer of state Item already exposes.
    createEffect(on(map.root._childrenVersion, () => rebind(map.root)));
  });
}

// Called by my-mind.js's showMap() (before switching to a new map) and
// unmount(), so a stale binding never holds a reference to a
// no-longer-current map's Item instances.
export function dispose() {
  disposeEffect?.();
  disposeEffect = null;
}

// Called by DragDropRoot's onDragEnd (see DragDropRoot.jsx) once it has
// confirmed the dragged element belongs to GROUP.
export function handleDragEnd(event) {
  if (event.canceled) {
    return;
  }
  const root = app.currentMap?.root;
  if (!root) {
    return;
  }
  const ids = root.children.map((child) => child.id);
  const nextIds = move(ids, event);
  const sourceId = event.operation.source?.id;
  const item = root.children.find((child) => child.id === sourceId);
  if (!item) {
    return;
  }
  const newIndex = nextIds.indexOf(sourceId);
  if (newIndex === -1 || newIndex === ids.indexOf(sourceId)) {
    return; // no actual position change
  }
  app.action(new actions.MoveItem(item, root, newIndex, item.side));
}
