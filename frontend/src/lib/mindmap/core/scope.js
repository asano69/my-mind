// scope.js — logical input-scope stack, independent of DOM focus.
//
// Before this, "should I react to this event" was answered ad hoc by
// each consumer: some read activeMode() directly, some added their own
// editing()/open-state checks, and dialogs relied entirely on DOM focus
// to keep canvas-level hotkeys away -- which works for focus-based
// events (keydown, scoped to containerEl) but NOT for Selection-based
// ones (cut/copy/paste, see docs/d01-clipboard-event-targeting.md):
// newClipboard.js listens on `document`'s capture phase and only ever
// checked isCanvasActive(), so pasting into e.g. ValueDialog's own
// input while it was open could be silently hijacked by the canvas's
// paste handler. The scope stack below is the single place that
// answers "what currently owns input", so every consumer (keyboard,
// clipboard, mouse) can ask the same question instead of re-deriving
// their own answer.
//
// The base scope is always store.js's activeMode ("canvas" | "notes").
// Anything transient and exclusive layered on top of it -- a dialog, the
// file switcher, live title editing, ... -- pushes its own named scope
// while active and pops it automatically on cleanup. Only the top of
// the stack is ever "active": this is a modal stack (like a z-index for
// input ownership), not a set of independently toggleable flags.
import { createSignal, createEffect, onCleanup } from "solid-js";
import { activeMode } from "../store.js";

const [pushedScopes, setPushedScopes] = createSignal([]);
let seq = 0;

function pushScope(name) {
  const token = ++seq;
  setPushedScopes((s) => [...s, { name, token }]);
  return () => setPushedScopes((s) => s.filter((e) => e.token !== token));
}

// For a Solid component that is only ever mounted while its scope
// should be active (e.g. a dialog with no "closed but still mounted"
// state): push on mount, pop on unmount.
export function useScope(name) {
  onCleanup(pushScope(name));
}

// For a scope driven by a boolean signal instead of the component's own
// mount lifecycle (e.g. a dialog controlled by an `open` prop that stays
// mounted while closed -- ConfirmDialog/ValueDialog/FileSwitcher all
// work this way).
export function useScopeWhen(active, name) {
  createEffect(() => {
    if (!active()) {
      return;
    }
    onCleanup(pushScope(name));
  });
}

// The name of whichever scope currently owns input: the most recently
// pushed still-active scope, or the base activeMode() if nothing is
// pushed.
export function topScope() {
  const pushed = pushedScopes();
  return pushed.length ? pushed[pushed.length - 1].name : activeMode();
}

export function isScopeActive(name) {
  return topScope() === name;
}

// Most existing call sites just want "is the canvas the current top
// scope" -- true exactly when nothing (a dialog, the file switcher,
// live title editing, ...) has pushed itself above it.
export function isCanvasActive() {
  return isScopeActive("canvas");
}

// Auto-detected scope: focusing any plain form control (<input>/
// <textarea>/<select>) pushes this scope for as long as it stays
// focused, so canvas-level hotkeys (newKeyboard.js) and clipboard
// handling (newClipboard.js, which listens on document's capture phase
// and can't otherwise tell a panel field apart from the canvas) never
// leak into ordinary fields like RightPanelProperties.jsx's UrlField or
// Search.jsx -- both of those currently render *inside*
// MindMapCanvas.jsx's containerRef, so their keydown events bubble
// straight into the canvas's own keydown listener. This mirrors the old
// engine's ui.isActive() check (see NotesEditor.jsx's own comment on
// it), but as a normal scope every consumer already knows how to ask
// about, instead of a bespoke boolean each one had to remember to add.
//
// A node's own contentEditable text element (see newEdit.js) is
// deliberately NOT covered here -- that case is already tracked by
// itemSelection.js's `editing` signal and checked explicitly by both
// newKeyboard.js and newClipboard.js, and it isn't a plain form control
// anyway (no matching tagName below).
const FORM_FIELD_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
let popFormFieldScope = null;

function handleFormFieldFocusIn(e) {
  if (FORM_FIELD_TAGS.has(e.target?.tagName) && !popFormFieldScope) {
    popFormFieldScope = pushScope("form-field");
  }
}
function handleFormFieldFocusOut(e) {
  if (FORM_FIELD_TAGS.has(e.target?.tagName) && popFormFieldScope) {
    popFormFieldScope();
    popFormFieldScope = null;
  }
}
// Guarded for test environments (vitest's default "node" environment has
// no `document` global until a test stubs one) -- see this project's
// other document-dependent modules (e.g. newClipboard.js) for the same
// pattern of checking availability before touching browser globals.
if (typeof document !== "undefined") {
  document.addEventListener("focusin", handleFormFieldFocusIn);
  document.addEventListener("focusout", handleFormFieldFocusOut);
}
