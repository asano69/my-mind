// newContextMenuCommands.js — merged engine + app command repo.
//
// Per docs/mind-map-core-engine-library.md's Step 3, the engine-only
// commands (formatting, tree edits, undo/redo, viewport, per-item
// metadata) now live in core/engineCommands.js, and the app-only
// commands (persistence, UI chrome, notes mode) live in appCommands.js.
// This file exists only to merge the two Maps back together for
// host-side UI that displays the full command set regardless of which
// layer a given command belongs to (ContextMenu.jsx, LeftPanel.jsx,
// HelpPanel.jsx, TopBar.jsx) -- none of those care about the boundary;
// only core/newKeyboard.js does (see that file's own import of
// engineCommands.js directly, to keep appCommands.js's store.js/ui/*
// dependencies out of core/**).
import {
  repo as engineRepo,
  setPanKeyboardScope,
  disposePan,
} from "./core/engineCommands.js";
import { repo as appRepo } from "./appCommands.js";

export const repo = new Map([...engineRepo, ...appRepo]);
export { setPanKeyboardScope, disposePan };
