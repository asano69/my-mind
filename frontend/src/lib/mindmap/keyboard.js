import * as ui from "./ui/ui.js";
import { repo as commandRepo } from "./command/command.js";
import { isCanvasActive } from "./scope.js";

function handleEvent(e) {
  // Ignore all mindmap shortcuts while the canvas is backgrounded (see
  // docs/workspace-mode-switch-refactor.md, Phase 3).
  if (!isCanvasActive()) {
    return;
  }

  // Ignore key events that are part of IME composition (e.g. Japanese input).
  // Without this check, pressing Enter to confirm an IME candidate would also
  // trigger the app's "finish editing" command — particularly visible in Firefox.
  if (e.isComposing) {
    return;
  }

  // Escape always releases any stray focus (e.g. a property-panel <select>
  // or the title input) before checking ui.isActive(). Without this,
  // focus left on such an element would permanently block every mindmap
  // shortcut -- including Escape itself -- until the user happened to
  // click back into the canvas.
  if (e.key === "Escape" && ui.isActive()) {
    document.activeElement.blur();
  }

  // Some other part of the UI (title bar, notes editor, property panel, ...)
  // currently has keyboard focus: let it handle the event and do not treat
  // this keystroke as a mindmap shortcut.
  if (ui.isActive()) {
    return;
  }
  // For modifier-based shortcuts, always prevent browser interception
  const isModifierShortcut = [...commandRepo.values()].some((command) =>
    command.keys.some((key) => keyOK(key, e) && (key.ctrlKey || key.metaKey)),
  );
  if (isModifierShortcut) {
    e.preventDefault();
  }
  let command = [...commandRepo.values()].find((command) => {
    if (!command.isValid) {
      return false;
    }
    return command.keys.find((key) => keyOK(key, e));
  });
  if (command) {
    e.preventDefault();
    command.execute(e);
  }
}

export function init(containerEl) {
  containerEl.addEventListener("keydown", handleEvent);
  containerEl.addEventListener("focusout", handleFocusOut);
  containerEl.focus();
}

// Called by my-mind.js's unmount(). Without this, remounting would leave
// the previous mount's listener attached, firing every shortcut twice.
export function dispose(containerEl) {
  containerEl.removeEventListener("keydown", handleEvent);
  containerEl.removeEventListener("focusout", handleFocusOut);
}

function keyOK(key, e) {
  return Object.entries(key).every(([key, value]) => e[key] == value);
}

// Self-healing focus guard: if focus leaves containerEl without landing
// on another real element (e.g. item.js's stopEditing() calls blur()
// without focusing anything afterward), the browser drops focus to
// document.body, and every subsequent keydown -- including browser
// defaults like Ctrl+B -- stops reaching this listener entirely.
// Rather than remembering to call containerEl.focus() at every call
// site that might blur (mouse.js's onDragStart already needs this for
// drag interactions), this single listener restores focus whenever it
// notices nothing else claimed it, covering every current and future
// case uniformly. Deferred one microtask so the browser finishes
// assigning the new focus target (e.g. a legitimate <input>) first.
function handleFocusOut(e) {
  const container = e.currentTarget;
  queueMicrotask(() => {
    if (document.activeElement === document.body) {
      container.focus();
    }
  });
}
