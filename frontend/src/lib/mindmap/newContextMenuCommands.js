// newContextMenuCommands.js — command set for ContextMenu.jsx's
// right-click menu when the ?newEngine=1 preview is active. Mirrors
// the subset of command/command.js's commands the menu exposes, but
// operates on itemSelection.js's currentItem and
// newAction.js/newEdit.js/history.js instead of the old engine's
// app.currentItem -- calling the old command repo against a
// currentItem the new engine never sets is what caused
// edit/insert-child/insert-sibling/delete to throw.
import { currentItem, editing, setEditing } from "./itemSelection.js";
import { startEditing } from "./newEdit.js";
import { action, InsertNewItem, RemoveItem } from "./newAction.js";
import * as history from "./history.js";
import { openValueDialog } from "./store.js";
import * as notes from "./ui/notes.js";
import * as newViewport from "./newViewport.js";

function insertAndEdit(insertAction) {
  insertAction.do();
  if (startEditing(insertAction.item)) {
    setEditing(true);
  }
}

export const repo = new Map([
  [
    "notes",
    {
      label: "Notes",
      isValid: true,
      // notes.js resolves the active engine's selection itself (see
      // currentSelection.js), so the same toggle() the old engine's
      // Notes command calls already works here unchanged.
      execute: () => notes.toggle(),
    },
  ],
  [
    "insert-child",
    {
      label: "Insert a child",
      get isValid() {
        return !editing();
      },
      execute() {
        const item = currentItem();
        if (!item) return;
        insertAndEdit(new InsertNewItem(item, item.children.length));
      },
    },
  ],
  [
    "insert-sibling",
    {
      label: "Insert a sibling",
      get isValid() {
        return !editing();
      },
      execute() {
        const item = currentItem();
        if (!item) return;
        let insertAction;
        if (item.isRoot) {
          insertAction = new InsertNewItem(item, item.children.length);
        } else {
          const parent = item.parent;
          insertAction = new InsertNewItem(
            parent,
            parent.children.indexOf(item) + 1,
          );
        }
        insertAndEdit(insertAction);
      },
    },
  ],
  [
    "delete",
    {
      label: "Delete an item",
      get isValid() {
        return !editing() && !currentItem()?.isRoot;
      },
      execute() {
        const item = currentItem();
        if (!item || item.isRoot) return;
        action(new RemoveItem(item));
      },
    },
  ],
  [
    "edit",
    {
      label: "Edit item",
      get isValid() {
        return !editing();
      },
      execute() {
        const item = currentItem();
        if (item && startEditing(item)) {
          setEditing(true);
        }
      },
    },
  ],
  [
    "value",
    {
      label: "Set value",
      isValid: true,
      execute: () => openValueDialog(),
    },
  ],
  [
    "undo",
    {
      label: "Undo",
      get isValid() {
        history.historyVersion();
        return history.canBack();
      },
      execute: () => history.back(),
    },
  ],
  [
    "redo",
    {
      label: "Redo",
      get isValid() {
        history.historyVersion();
        return history.canForward();
      },
      execute: () => history.forward(),
    },
  ],
  [
    "center",
    {
      label: "Center map",
      isValid: true,
      execute: () => newViewport.recenter(),
    },
  ],
]);
