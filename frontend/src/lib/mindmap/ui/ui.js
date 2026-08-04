import * as app from "../my-mind.js";
import * as io from "./io.js";
import * as menu from "./context-menu.js";
import { repo as commandRepo } from "../command/command.js";
import { toggleRightPanel } from "../store.js";
import { isCanvasActive } from "../scope.js";

export function isActive() {
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLSelectElement ||
    active instanceof HTMLTextAreaElement
  ) {
    return true;
  }
  // The mindmap engine's own item-text editing is a contentEditable div;
  // any other contentEditable region belongs to some other part of the UI
  // (and should not receive mindmap shortcuts).
  // The #io save panel was removed (saving is now instant, see
  // ui/io.js's quickSave()), so there is no longer a panel focus state
  // to check here.
  if (active?.isContentEditable && active !== app.currentItem?.dom.text) {
    return true;
  }
  return false;
}

// #ui (RightPanel.jsx) reads/writes its own visibility directly from
// store.js's rightPanelHidden signal — same "no bridge object needed for
// read-only/self-owned state" pattern LeftPanel.jsx already uses for
// leftPanelHidden. This command just flips that shared signal; the
// createEffect in my-mind.js's mount() reacts to the change and recomputes
// the canvas size, so no explicit handleResize() call is needed here.
export function toggle() {
  toggleRightPanel();
}
function onClick(e) {
  if (!isCanvasActive()) {
    return;
  }
  let target = e.target;
  let current = target;
  while (true) {
    let command = current.dataset.command;
    if (command) {
      commandRepo.get(command).execute();
      return;
    }
    if (current.parentNode instanceof Element) {
      current = current.parentNode;
    } else {
      return;
    }
  }
}
// Returns whether io.restore() actually loaded and displayed an existing
// map, so my-mind.js's mount() knows whether it still needs to create a
// blank one — avoids the old race where a blank map was created
// unconditionally and then (maybe) overwritten once restore() resolved.
export async function init(port, containerEl, uuid) {
  // layout/shape/value/status no longer live here — see RightPanel.jsx,
  // which reads store.js's `currentItem` signal directly instead of being
  // driven by this module's init()/dispose()/pubsub wiring (Solid migration
  // Phase 3, see CLAUDE.md).
  // notes.js no longer has init()/dispose(): its editorAPI registration
  // lives in NotesEditor.jsx for the whole Workspace lifetime, independent
  // of the canvas's own mount/unmount cycle (see notes.js's comment).
  // Save-status text is rendered reactively by RightPanel.jsx, which reads
  // store.js's `lastSaveTime` signal directly instead of this module
  // polling a DOM node (see io.js's formatSaveStatus()).
  io.init();
  menu.init(port);
  containerEl.addEventListener("click", onClick);
  return io.restore(uuid);
}

// Called by my-mind.js's unmount(). Tears down this module's own listener
// and timer, then disposes every child UI module in the reverse order
// init() brought them up, mirroring standard stack-unwind teardown order.
export function dispose(containerEl) {
  containerEl.removeEventListener("click", onClick);
  menu.dispose();
  io.dispose();
}
