import EasyMDE from "easymde";
import "easymde/dist/easymde.min.css";
import "./NotesEditor.css";
import { activeMode, currentItem } from "../lib/mindmap/store";
import { createEffect, createSignal, on, onMount, onCleanup } from "solid-js";

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

  // Idempotent wrapper around togglePreview(): EasyMDE only exposes a
  // toggle, not a "set to X" API, so callers (the createEffect below)
  // can just declare the desired state without worrying about calling
  // togglePreview() an odd number of times and ending up out of sync.
  function setPreviewMode(shouldPreview) {
    if (easyMDE.isPreviewActive() === shouldPreview) {
      return;
    }
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

    setPreviewMode(activeMode() !== "notes");
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

  // Notes mode -> editable; canvas mode -> read-only preview shown as the
  // background. Mirrors the Milkdown version's `crepe.setReadonly(mode !==
  // "notes")` effect, but through EasyMDE's togglePreview() instead of a
  // single readonly flag (see the module comment above).
  createEffect(
    on([ready, activeMode], ([isReady, mode]) => {
      if (!isReady) {
        return;
      }
      setPreviewMode(mode !== "notes");
      // Unlike Milkdown's ProseMirror, EasyMDE's CodeMirror textarea does
      // not lose keyboard focus just because it's no longer editable or
      // is covered by pointer-events-none (that only blocks mouse input).
      // Without an explicit blur here, switching back to canvas mode
      // would leave document.activeElement inside the notes editor,
      // and keyboard.js's ui.isActive() check (which treats any focused
      // <textarea> as "some other UI has focus") would keep blocking
      // every mindmap shortcut even though notes is now backgrounded.
      if (mode !== "notes") {
        easyMDE.codemirror.getInputField().blur();
      }
    }),
  );

  onCleanup(() => {
    window.removeEventListener("keydown", handleEscape, true);
    easyMDE?.toTextArea();
    easyMDE = null;
  });

  return (
    <div id="notes" class="h-full">
      <textarea ref={textareaRef} />
    </div>
  );
}
