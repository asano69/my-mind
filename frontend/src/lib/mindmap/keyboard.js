// frontend/src/lib/mindmap/keyboard.js
import * as ui from "./ui/ui.js";
import { repo as commandRepo } from "./command/command.js";

function handleEvent(e) {
  // Ignore key events that are part of IME composition (e.g. Japanese input).
  // Without this check, pressing Enter to confirm an IME candidate would also
  // trigger the app's "finish editing" command — particularly visible in Firefox.
  if (e.isComposing) {
    return;
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

export function init() {
  window.addEventListener("keydown", handleEvent);
  window.focus();
}
function keyOK(key, e) {
  return Object.entries(key).every(([key, value]) => e[key] == value);
}
