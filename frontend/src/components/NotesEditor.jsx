import EasyMDE from "easymde";
import "easymde/dist/easymde.min.css";
import "./NotesEditor.css";
import { activeMode, currentItem } from "../lib/mindmap/store";
import { createEffect, createSignal, on, onMount, onCleanup } from "solid-js";

/**
 * The markdown notes editor for the currently selected item.
 *
 * Phase 2 of the Milkdown -> EasyMDE rollback (see
 * docs/03.2-workspace-mode-switch-refactor.md for the Milkdown-era design
 * this replaces). EasyMDE has no single "readonly" flag like Milkdown did;
 * it has two separate rendering paths (raw-Markdown CodeMirror textarea vs.
 * a rendered HTML preview via togglePreview()). This phase only verifies
 * that switching those paths works correctly in isolation, via the
 * temporary debug button below -- it is NOT yet wired to activeMode
 * (that's Phase 3).
 *
 * ui/notes.js (and everything it pulls in) is imported dynamically, after
 * mount, for the same reason my-mind.js itself is in MindMapCanvas.jsx:
 * those modules query the DOM (e.g. `#notes`, `#ui`) at import time, so
 * they must not load before this component's elements are attached to
 * the document.
 */
export default function NotesEditor() {
  let textareaRef;
  let easyMDE;
  let notesModule; // cached after the first dynamic import, see onMount
  let applyingExternalContent = false;

  // Tracks whether notesModule/editorAPI are ready. The createEffect below
  // needs to react to *both* "the engine selected an item" and "our own
  // async setup finished" — whichever happens second. Without this signal,
  // if an item gets selected (e.g. on map load) before this component's
  // async notes.js import resolves, onItemSelect() would run with
  // an undefined notesModule and silently do nothing — and nothing would
  // ever retrigger it afterwards, since currentItem() itself doesn't
  // change again just because our setup finished.
  const [ready, setReady] = createSignal(false);

  function setMarkdown(text) {
    const next = text || "";
    if (easyMDE.value() === next) {
      return;
    }

    applyingExternalContent = true;
    easyMDE.value(next);
    applyingExternalContent = false;
  }

  // TEMPORARY (Phase 2 only): lets us confirm togglePreview() behaves
  // correctly -- in particular whether it triggers a CodeMirror re-layout
  // -- before wiring it to activeMode in Phase 3. Remove this button and
  // handler once Phase 3 lands.
  function debugTogglePreview() {
    easyMDE.togglePreview();
  }
  // keyboard.js gates on isCanvasActive(), so Escape never reaches it
  // while notes is the active mode (see
  // docs/03.2-workspace-mode-switch-refactor.md, Phase 6). Registered on
  // window with capture:true so it runs before CodeMirror's own keydown
  // handling. Ported unchanged from the Milkdown implementation; whether
  // CodeMirror ever swallows Escape itself is rechecked in Phase 5 of the
  // EasyMDE rollback plan.
  function handleEscape(e) {
    if (e.key !== "Escape" || activeMode() !== "notes") {
      return;
    }
    notesModule?.close();
  }
  onMount(async () => {
    easyMDE = new EasyMDE({
      element: textareaRef,
      autofocus: false,
      spellChecker: false,
    });
    easyMDE.codemirror.on("change", () => {
      if (applyingExternalContent) {
        return;
      }
      notesModule?.onEditorChange(easyMDE.value());
    });

    notesModule = await import("../lib/mindmap/ui/notes.js");

    notesModule.registerEditorAPI({
      setContent: setMarkdown,
    });

    window.addEventListener("keydown", handleEscape, true);
    setReady(true);
  });

  // Sync the notes editor and background preview whenever the selected
  // item changes, or once our async setup becomes ready — covers both
  // possible orderings of "item selected" vs "editor initialized".
  //
  // Uses on() to track ONLY `ready` and `currentItem` explicitly.
  // Without this, createEffect would also implicitly depend on
  // `item.notes` (read inside onItemSelect -> editorAPI.setContent),
  // causing every keystroke to re-run this effect and force-reset
  // the editor's value — which resets the cursor and swallows input.
  createEffect(
    on([ready, currentItem], ([isReady, item]) => {
      if (!isReady) {
        return;
      }
      notesModule.onItemSelect(item);
    }),
  );

  onCleanup(() => {
    window.removeEventListener("keydown", handleEscape, true);
    easyMDE?.toTextArea();
    easyMDE = null;
  });

  return (
    <div id="notes" class="h-full">
      {/* TEMPORARY (Phase 2 only): manual preview toggle for verification.
          Removed once Phase 3 hooks togglePreview() up to activeMode. */}
      <button
        type="button"
        onClick={debugTogglePreview}
        class="fixed top-2 right-2 z-10 rounded bg-pane px-2 py-1 text-xs shadow-card"
      >
        [debug] toggle preview
      </button>
      <textarea ref={textareaRef} />
    </div>
  );
}
