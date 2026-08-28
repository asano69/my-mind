import EasyMDE from "easymde";
import "easymde/dist/easymde.min.css";
import "./NotesEditor.css";
import {
  activeMode,
  hoveredItem,
  currentMapId,
  bumpNotesHistoryVersion,
} from "../lib/mindmap/store";
import { currentItem } from "../lib/mindmap/engineInstance.js";
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onMount,
  onCleanup,
  Show,
} from "solid-js";

export default function NotesEditor() {
  let textareaRef;
  let easyMDE;
  let notesModule; // cached after the first dynamic import, see onMount

  // Panel width is a plain px value (not vw) so the resize handle below
  // can add/subtract pixel deltas directly. Defaults to half the window,
  // matching the old fixed "50vw" CSS rule this replaces.
  const MIN_NOTES_WIDTH = 320;
  const RIGHT_MARGIN = 80; // keep some canvas visible even at max width
  const [width, setWidth] = createSignal(
    typeof window !== "undefined" ? window.innerWidth / 2 : 480,
  );
  // Set only while a drag is in progress, so onCleanup can tear down a
  // still-active drag if the component unmounts mid-resize (e.g.
  // switching maps while dragging).
  let stopResize = null;

  function startResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width();
    function onMove(moveEvent) {
      const delta = moveEvent.clientX - startX;
      const maxWidth = window.innerWidth - RIGHT_MARGIN;
      setWidth(
        Math.min(Math.max(startWidth + delta, MIN_NOTES_WIDTH), maxWidth),
      );
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      stopResize = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    stopResize = onUp;
  }

  // One CodeMirror Doc per item, keyed by item.id. CodeMirror 5's
  // undo/redo history belongs to the Doc, not to the editor instance --
  // the old code reused a single Doc across every item (via
  // easyMDE.value()), which meant undo/redo history was shared globally
  // across all notes: undoing after switching items would undo the
  // *previous* item's edit. Swapping in a per-item Doc
  // (easyMDE.codemirror.swapDoc()) gives each item its own independent
  // undo/redo stack.
  const docsByItemId = new Map();
  let currentDocItemId = null; // avoids a redundant swapDoc() for the same item

  // Tracks whether notesModule/editorAPI are ready. The createEffect below
  // needs to react to *both* "the engine selected an item" and "our own
  // async setup finished" — whichever happens second. Without this signal,
  // if an item gets selected (e.g. on map load) before this component's
  // async notes.js import resolves, onItemSelect() would run with
  // an undefined notesModule and silently do nothing — and nothing would
  // ever retrigger it afterwards, since currentItem() itself doesn't
  // change again just because our setup finished.
  const [ready, setReady] = createSignal(false);

  function getOrCreateDoc(item) {
    let doc = docsByItemId.get(item.id);
    if (!doc) {
      // Reuse the editor's own configured mode (e.g. "gfm") rather than
      // hardcoding it, so every per-item Doc renders/highlights exactly
      // like the editor's initial Doc did.
      const CodeMirror = easyMDE.codemirror.constructor;
      const mode = easyMDE.codemirror.getOption("mode");
      doc = new CodeMirror.Doc(item.notes || "", mode);
      docsByItemId.set(item.id, doc);
    }
    return doc;
  }

  // Switches the editor to show/edit `item`'s own Doc (creating one on
  // first use). swapDoc() does not fire a "change" event, so unlike the
  // old value()-based approach this needs no "applyingExternalContent"
  // guard to keep onEditorChange() from firing spuriously.
  function setContent(item) {
    if (!item || item.id === currentDocItemId) {
      return;
    }
    currentDocItemId = item.id;
    const wasPreview = easyMDE.isPreviewActive();
    easyMDE.codemirror.swapDoc(getOrCreateDoc(item));
    // EasyMDE's preview pane is a static render generated the moment
    // togglePreview() runs; changing the underlying doc while preview is
    // already active does not refresh it. Without this, switching maps
    // while backgrounded left the notes preview showing the previous
    // map's content. Toggle off/on to force a fresh render.
    if (wasPreview) {
      easyMDE.togglePreview();
      easyMDE.togglePreview();
    }
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
      toolbar: false,
    });
    easyMDE.codemirror.on("change", () => {
      // Bumped on every change, including programmatic setValue() calls
      // (e.g. switching to a different item's notes, which CodeMirror
      // treats as a full history reset) -- see notes.js's canUndo()/
      // canRedo(), read by command/command.js's Undo/Redo commands.
      bumpNotesHistoryVersion();
      // No "applyingExternalContent" guard needed here: switching items
      // uses swapDoc() (see setContent() above), which does not fire a
      // "change" event at all, unlike the old value()-based approach.
      notesModule?.onEditorChange(easyMDE.value());
    });

    setPreviewMode(activeMode() !== "notes");
    notesModule = await import("../lib/mindmap/ui/notes.js");

    notesModule.registerEditorAPI({
      setContent,
      undo: () => easyMDE.codemirror.undo(),
      redo: () => easyMDE.codemirror.redo(),
      historySize: () => easyMDE.codemirror.historySize(),
    });
    window.addEventListener("keydown", handleEscape, true);
    setReady(true);
  });

  // Which item's notes should currently be shown/edited. While notes is
  // the active (foreground, editable) mode, this is always the selected
  // item -- editing follows selection, not the mouse. While canvas is the
  // active mode, the background preview instead follows whatever item is
  // under the pointer (see store.js's hoveredItem), falling back to the
  // selected item when the pointer isn't over any item.
  const previewItem = createMemo(() =>
    activeMode() === "notes" ? currentItem() : (hoveredItem() ?? currentItem()),
  );

  // Sync the notes editor and background preview whenever previewItem
  // changes, or once our async setup becomes ready — covers both
  // possible orderings of "item selected" vs "editor initialized".
  //
  // Uses on() to track ONLY `ready` and `previewItem` explicitly.
  // Without this, createEffect would also implicitly depend on
  // `item.notes` (read inside onItemSelect -> editorAPI.setContent),
  // causing every keystroke to re-run this effect and force-reset
  // the editor's value — which resets the cursor and swallows input.
  createEffect(
    on([ready, previewItem], ([isReady, item]) => {
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

  // Each Doc's undo/redo history only makes sense within the map it
  // belongs to -- item ids aren't guaranteed unique across different
  // maps, and there is no reason to keep every map's Docs alive for the
  // whole app session. Clear the cache whenever the open map changes, so
  // stale Docs (and their history) from a previous map are dropped.
  createEffect(
    on(
      currentMapId,
      () => {
        docsByItemId.clear();
        currentDocItemId = null;
      },
      { defer: true },
    ),
  );

  onCleanup(() => {
    window.removeEventListener("keydown", handleEscape, true);
    stopResize?.();
    docsByItemId.clear();
    easyMDE?.toTextArea();
    easyMDE = null;
  });

  return (
    <div
      id="notes"
      class="relative h-full"
      style={{
        width: `${width()}px`,
        // Semi-transparent while backgrounded (canvas mode), so the
        // preview text doesn't fully obscure the mind-map underneath it.
        // Fully opaque while notes is the active, editable mode.
        opacity: activeMode() === "notes" ? 1 : 0.45,
      }}
    >
      {/* Right-edge drag handle for resizing the panel — see startResize()
          above. Width itself defaults to half the window (see the width
          signal) but can be dragged wider/narrower from here. Only shown
          while notes is the active (foreground) mode; the handle is
          meaningless while the canvas is in front and notes is just a
          read-only background preview. */}
      <Show when={activeMode() === "notes"}>
        <div class="notes-resize-handle" onPointerDown={startResize} />
      </Show>
      <textarea ref={textareaRef} />
    </div>
  );
}
