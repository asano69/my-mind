// scope.js — shared guard for engine-only listeners (keyboard, mouse,
// clipboard, ui click delegation) while the canvas is not the active
// workspace mode (see docs/workspace-mode-switch-refactor.md, Phase 3).
import { activeMode } from "./store.js";

export function isCanvasActive() {
  return activeMode() === "canvas";
}
