// appCommands.js — command set for app-only actions: PocketBase
// persistence (save, new, go-to-catalog), UI chrome (help, ui, recover,
// catalog-list, file-switcher), the value dialog, and notes mode.
//
// Split out of newContextMenuCommands.js per docs/mind-map-core-engine-library.md's
// Step 3. Deliberately NOT under core/ -- every command here touches
// store.js, ui/io.js, ui/notes.js, ui/toast.jsx, or navigation.js, none
// of which the engine itself is allowed to know about. The engine-only
// commands live in core/engineCommands.js instead; newContextMenuCommands.js
// merges both repos back together for host-side UI that doesn't care
// which layer a given command belongs to.
//
// "notes" was previously part of the merged repo alongside the engine
// commands, but toggling notes mode is an app-level UI concern
// (activeMode, EasyMDE integration) rather than something the tree
// model itself needs to know about -- moved here instead of
// engineCommands.js, per the doc's own note on this.
import {
  openValueDialog,
  openHelp,
  openSnapshots,
  openCatalogList,
  openFileSwitcher,
  setLeftPanelHidden,
  toggleRightPanel,
} from "./store.js";
import * as notes from "./ui/notes.js";
import * as io from "./ui/io.js";
import { showToast } from "./ui/toast.jsx";
import { navigateTo } from "./navigation.js";

export const repo = new Map([
  [
    "notes",
    {
      label: "Notes",
      isValid: true,
      keys: [{ code: "KeyM", ctrlKey: true }],
      // notes.js resolves the active engine's selection itself (see
      // currentSelection.js), so the same toggle() the old engine's
      // Notes command calls already works here unchanged.
      execute: () => notes.toggle(),
    },
  ],
  [
    "value",
    {
      label: "Set value",
      isValid: true,
      keys: [{ key: "v", ctrlKey: false, metaKey: false }],
      execute: () => openValueDialog(),
    },
  ],
  [
    "save",
    {
      label: "Save map",
      isValid: true,
      keys: [{ code: "KeyS", ctrlKey: true, shiftKey: true }],
      async execute() {
        const saved = await io.quickSave();
        if (saved) {
          showToast("Mind map saved");
        } else {
          showToast("Failed to save mind map", undefined, { variant: "error" });
        }
      },
    },
  ],
  [
    "help",
    {
      label: "Show/hide help",
      isValid: true,
      keys: [{ key: "?" }],
      execute: () => {
        openHelp();
        setLeftPanelHidden(false);
      },
    },
  ],
  [
    "ui",
    {
      label: "Show/hide UI",
      isValid: true,
      keys: [{ key: "*" }],
      execute: () => toggleRightPanel(),
    },
  ],
  [
    "recover",
    {
      label: "Restore a past snapshot",
      isValid: true,
      keys: [],
      execute: () => {
        setLeftPanelHidden(false);
        openSnapshots();
      },
    },
  ],
  [
    "catalog-list",
    {
      label: "Browse maps",
      isValid: true,
      keys: [],
      execute: () => {
        setLeftPanelHidden(false);
        openCatalogList();
      },
    },
  ],
  [
    "file-switcher",
    {
      label: "Switch map",
      isValid: true,
      keys: [{ code: "KeyK", ctrlKey: true }],
      execute: () => openFileSwitcher(),
    },
  ],
  [
    "go-to-catalog",
    {
      label: "Go to catalog",
      isValid: true,
      keys: [{ code: "KeyP", ctrlKey: true }],
      async execute() {
        if (!(await io.confirmLeave())) {
          return;
        }
        if (!navigateTo("/catalog")) {
          window.location.href = "/catalog";
        }
      },
    },
  ],
  [
    "new",
    {
      label: "New map",
      isValid: true,
      keys: [{ code: "KeyO", ctrlKey: true, shiftKey: true }],
      async execute() {
        if (!(await io.confirmLeave())) {
          return;
        }
        io.resetCurrentMap();
        if (!navigateTo("/maps/new")) {
          window.location.href = "/maps/new";
        }
      },
    },
  ],
]);
