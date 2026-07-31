// Phases 3-5 of the dnd-kit refactor (see docs/07-dnd-kit-solid-refactor.md).
// Phase 3 generalized the single fixed group ("root-children") to
// `group = parent.id` for every non-root parent in the tree, so a drag can
// move an item across parents, not just reorder siblings under a fixed
// parent. Phase 4 added a placeholder droppable for childless parents
// (see syncEmptyDroppable below). Phase 5 (this revision) splits root's
// own direct children into two independent groups, "<rootId>:left" and
// "<rootId>:right", matching MapLayout's own left/right rendering -- see
// rootGroupId()/syncRootChildren() below.
//
// Still out of scope:
// - Explicit teardown of a watcher/binding for an item once it is
//   removed from the tree entirely (RemoveItem/cut). Left as a known,
//   harmless leak for now; addressed in Phase 6's cleanup pass.
import { createRoot, createEffect, on } from "solid-js";
import { useSortable, } from "@dnd-kit/solid/sortable";
import { useDroppable } from "@dnd-kit/solid";
import { move } from "@dnd-kit/helpers";
import * as app from "../my-mind.js";
import * as actions from "../action.js";

// Suffix used for the id of an empty-parent's placeholder droppable (see
// bindEmptyDroppable below), so handleDragEnd can tell "dropped onto a
// real sortable sibling" apart from "dropped onto a childless node's
// content box" without any extra bookkeeping.
const EMPTY_ID_SUFFIX = ":empty";

// item id -> dispose fn for that item's own useSortable ref
let bindings = new Map();
// item id -> dispose fn for the effect watching that item's *children*
let watchers = new Map();
// item id -> dispose fn for that item's empty-container useDroppable,
// present only while item.children.length === 0 (see syncEmptyDroppable).
let emptyDroppables = new Map();
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

// While `item` has zero children, its content box has no useSortable
// element registered inside it (Phase 3's bindings only cover existing
// children), so a drag has nothing to collide with there. Registering a
// plain useDroppable directly on the same content node, scoped to
// item.id's own group, lets a drag be dropped "into" a childless node to
// become its first child. Removed again the moment a first child
// appears, since Phase 3's own sortable bindings take over from there.
function syncEmptyDroppable(item) {
  const hasDroppable = emptyDroppables.has(item.id);
  if (item.children.length === 0) {
    if (hasDroppable) {
      return; // already registered, nothing changed
    }
    createRoot((dispose) => {
      const { ref } = useDroppable({
        id: `${item.id}${EMPTY_ID_SUFFIX}`,
        accept: "item",
        data: { emptyParentId: item.id },
      });
      ref(item.dom.content);
      emptyDroppables.set(item.id, dispose);
    });
  } else if (hasDroppable) {
    emptyDroppables.get(item.id)();
    emptyDroppables.delete(item.id);
  }
}

// Binds every direct child of `parent` (whose group id is `groupId`,
// i.e. parent.id) and makes sure each child's own children are being
// watched, so a structural change anywhere in the tree eventually
// re-syncs only the directly affected parent's list.
function syncChildren(parent, groupId) {
  parent.children.forEach((child, index) => {
    bindItem(child, groupId, index);
    watchNode(child);
    syncEmptyDroppable(child);
  });
  syncEmptyDroppable(parent);
}

// Splits root's direct children into two independent dnd-kit groups by
// side, "<rootId>:left" and "<rootId>:right", instead of the single
// `root.id` group every other parent uses (see syncChildren above). This
// mirrors MapLayout's own left/right rendering (see layout/map.js's
// MapLayout.layoutRoot) and lets dnd-kit's Multiple Sortable Lists do the
// left/right placement the same way it already handles ordinary
// reparenting elsewhere in the tree.
function rootGroupId(root, side) {
  return `${root.id}:${side}`;
}

// Binds root's children into their side's group, based on each child's
// resolved side (layout/map.js's MapLayout.getChildDirection, which as of
// Phase 5 returns child.side || "right" with no sibling-counting
// auto-balance -- see that file's comment). Each group's own index is the
// child's position within just that side's children, matching what
// MapLayout expects when it lays out root's left/right lists
// independently.
function syncRootChildren(root) {
  const bySide = { left: [], right: [] };
  root.children.forEach((child) => {
    bySide[root.resolvedLayout.getChildDirection(child)].push(child);
  });
  ["left", "right"].forEach((side) => {
    const groupId = rootGroupId(root, side);
    bySide[side].forEach((child, index) => {
      bindItem(child, groupId, index);
      watchNode(child);
      syncEmptyDroppable(child);
    });
  });
  syncEmptyDroppable(root);
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
  emptyDroppables.forEach((dispose) => dispose());
  emptyDroppables.clear();
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
    // Plain createEffect (not on()) because the dependency set is
    // dynamic: besides root's own _childrenVersion, this also reads
    // every direct child's _sideVersion, so a side change from the
    // SetSide command (Ctrl+Left/Right) re-runs syncRootChildren() and
    // moves that child into its new root:left/root:right dnd-kit group,
    // not just structural inserts/removes.
    createEffect(() => {
      map.root._childrenVersion();
      map.root.children.forEach((child) => child._sideVersion());
      syncRootChildren(map.root);
    });
    // syncRootChildren() above covers "root has zero children" (a
    // brand-new map) via its own syncEmptyDroppable(root) call.
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
// shape @dnd-kit/helpers' move() expects for cross-group moves. Root's
// direct children are split into their two side groups (see
// rootGroupId()/syncRootChildren() above) instead of one root.id group.
// Rebuilt fresh on every drag end (a single O(tree size) walk per drop,
// not per frame), which keeps this function simple at the cost of some
// unnecessary work on very large maps -- acceptable for now per
// CLAUDE.md's simplicity-first guidance; revisit only if profiling shows
// it matters.
function buildItemsByGroup(root) {
  const record = {};
  const bySide = { left: [], right: [] };
  root.children.forEach((child) => {
    bySide[root.resolvedLayout.getChildDirection(child)].push(child.id);
  });
  record[rootGroupId(root, "left")] = bySide.left;
  record[rootGroupId(root, "right")] = bySide.right;

  function walk(item) {
    if (item !== root) {
      record[item.id] = item.children.map((child) => child.id);
    }
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

  const sourceId = event.operation.source?.id;
  if (!sourceId) {
    return;
  }

  // Dropped directly onto a childless node's placeholder droppable (see
  // syncEmptyDroppable) -- handled separately from the move() path below,
  // since there is no existing sibling list to reorder within; this is
  // always "become this parent's first child," full stop.
  const emptyParentId = event.operation.target?.data?.emptyParentId;
  if (emptyParentId) {
    const item = findItem(root, sourceId);
    const newParent = findItem(root, emptyParentId);
    if (!item || !newParent || item === newParent) {
      return;
    }
    // Root has no existing children to infer a side from here (that's
    // exactly why it's the "empty" case) -- keep the item's current side
    // if it already has one, otherwise default to "right", the same
    // default MapLayout.getChildDirection uses.
    const newSide = newParent === root ? item.side || "right" : item.side;
    app.action(new actions.MoveItem(item, newParent, 0, newSide));
    return;
  }

  const itemsByGroup = buildItemsByGroup(root);
  const nextItemsByGroup = move(itemsByGroup, event);

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

  const oldParent = item.parent;
  const oldIndex = oldParent.children.indexOf(item);
  // Old group id must use the same "<rootId>:side" scheme as newParentId
  // when the item's current parent is root, or a same-side/same-index
  // no-op drag would be misread as a real move.
  const oldGroupId =
    oldParent === root
      ? rootGroupId(root, root.resolvedLayout.getChildDirection(item))
      : oldParent.id;
  if (newParentId === oldGroupId && newIndex === oldIndex) {
    return; // no actual change
  }

  const rootLeftId = rootGroupId(root, "left");
  const rootRightId = rootGroupId(root, "right");
  let newParent;
  let newSide = item.side;
  if (newParentId === rootLeftId || newParentId === rootRightId) {
    newParent = root;
    newSide = newParentId === rootLeftId ? "left" : "right";
  } else {
    newParent = findItem(root, newParentId);
  }
  if (!newParent) {
    return;
  }

  app.action(new actions.MoveItem(item, newParent, newIndex, newSide));
}
