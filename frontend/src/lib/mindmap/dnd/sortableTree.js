// Phase 3 of the dnd-kit refactor (see docs/07-dnd-kit-solid-refactor.md).
// Generalizes Phase 2's single fixed group ("root-children") to
// `group = parent.id` for every parent in the tree, so a drag can move an
// item across parents, not just reorder siblings under a fixed parent.
//
// Still out of scope for this phase (see the plan doc):
// - Dropping into a node that currently has zero children (Phase 4).
// - Root's left/right side grouping (Phase 5) -- root's own children
//   still share one group, same as Phase 2.
// - Explicit teardown of a watcher/binding for an item once it is
//   removed from the tree entirely (RemoveItem/cut). Left as a known,
//   harmless leak for now; addressed in Phase 6's cleanup pass.
import { createRoot, createEffect, on } from "solid-js";
import { useSortable } from "@dnd-kit/solid/sortable";
import { move } from "@dnd-kit/helpers";
import * as app from "../my-mind.js";
import * as actions from "../action.js";

// item id -> dispose fn for that item's own useSortable ref
let bindings = new Map();
// item id -> dispose fn for the effect watching that item's *children*
let watchers = new Map();
let rootWatcherDispose = null;

function bindItem(item, groupId, index) {
  // Always dispose any previous binding for this id first. This makes
  // rebinding order-independent: whichever parent's sync call actually
  // lists this child wins, regardless of whether the old or new parent's
  // _childrenVersion effect happens to run first (both read the fully
  // settled tree, since insertChild/removeChild mutate inside batch()).
  bindings.get(item.id)?.();
  createRoot((dispose) => {
    const { ref } = useSortable({
      id: item.id,
      group: groupId,
      accept: "item",
      type: "item",
      index,
      data: { group: groupId },
    });
    ref(item.dom.content);
    bindings.set(item.id, dispose);
  });
}

// Binds every direct child of `parent` (whose group id is `groupId`,
// i.e. parent.id) and makes sure each child's own children are being
// watched, so a structural change anywhere in the tree eventually
// re-syncs only the directly affected parent's list.
function syncChildren(parent, groupId) {
  parent.children.forEach((child, index) => {
    bindItem(child, groupId, index);
    watchNode(child);
  });
}

function watchNode(item) {
  if (watchers.has(item.id)) {
    return;
  }
  createRoot((dispose) => {
    watchers.set(item.id, dispose);
    createEffect(on(item._childrenVersion, () => syncChildren(item, item.id)));
  });
}

function unbindAll() {
  bindings.forEach((dispose) => dispose());
  bindings.clear();
  watchers.forEach((dispose) => dispose());
  watchers.clear();
}

// Called by my-mind.js's showMap() whenever a map becomes current.
export function init(map) {
  if (!map) {
    return;
  }
  createRoot((dispose) => {
    rootWatcherDispose = () => {
      unbindAll();
      dispose();
    };
    // Map's `id` getter delegates to root.id (see map.js), so using
    // map.root.id as the group id here is consistent with how a child
    // item's `item.parent.id` resolves to the same value whether
    // `item.parent` is the Map instance (root's direct children) or
    // another Item.
    createEffect(
      on(map.root._childrenVersion, () => syncChildren(map.root, map.root.id)),
    );
  });
}

// Called by my-mind.js's showMap() (before switching) and unmount().
export function dispose() {
  rootWatcherDispose?.();
  rootWatcherDispose = null;
}

function findItem(root, id) {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children) {
    const found = findItem(child, id);
    if (found) {
      return found;
    }
  }
  return null;
}

// Snapshots the whole tree as a group-id -> child-id-array record, the
// shape @dnd-kit/helpers' move() expects for cross-group moves. Rebuilt
// fresh on every drag end (a single O(tree size) walk per drop, not per
// frame), which keeps this function simple at the cost of some
// unnecessary work on very large maps -- acceptable for now per
// CLAUDE.md's simplicity-first guidance; revisit only if profiling shows
// it matters.
function buildItemsByGroup(root) {
  const record = {};
  function walk(item) {
    record[item.id] = item.children.map((child) => child.id);
    item.children.forEach(walk);
  }
  walk(root);
  return record;
}

// Called by DragDropRoot's onDragEnd for any drag whose source belongs
// to one of this module's groups.
export function handleDragEnd(event) {
  if (event.canceled) {
    return;
  }
  const root = app.currentMap?.root;
  if (!root) {
    return;
  }

  const itemsByGroup = buildItemsByGroup(root);
  const nextItemsByGroup = move(itemsByGroup, event);

  const sourceId = event.operation.source?.id;
  if (!sourceId) {
    return;
  }
  const item = findItem(root, sourceId);
  if (!item) {
    return;
  }

  let newParentId = null;
  let newIndex = -1;
  for (const [groupId, ids] of Object.entries(nextItemsByGroup)) {
    const idx = ids.indexOf(sourceId);
    if (idx !== -1) {
      newParentId = groupId;
      newIndex = idx;
      break;
    }
  }
  if (newParentId === null) {
    return;
  }

  const oldParentId = item.parent.id;
  const oldIndex = item.parent.children.indexOf(item);
  if (newParentId === oldParentId && newIndex === oldIndex) {
    return; // no actual change
  }

  const newParent = findItem(root, newParentId);
  if (!newParent) {
    return;
  }

  // Side (left/right under root) is intentionally left unchanged here --
  // that distinction is Phase 5's job. Non-root reparenting doesn't use
  // `side` at all, so passing it through as-is is a no-op in that case.
  app.action(new actions.MoveItem(item, newParent, newIndex, item.side));
}
