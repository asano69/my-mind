import { createSignal, createEffect, onMount, onCleanup } from "solid-js";
import EasyMDE from "easymde";
import "easymde/dist/easymde.min.css";
import "./NotesEditor.css";
import { currentItem } from "../lib/mindmap/store";
/**
 * The markdown notes editor for the currently selected item.
 *
 * This used to be a separate editor.html document loaded in a sandboxed
 * iframe, talking to the mindmap engine over postMessage. Now that it's
 * just another Solid component in the same document, it registers itself
 * directly with ui/notes.js instead of going through a message protocol.
 *
 * ui/notes.js (and everything it pulls in) is imported dynamically, after
 * mount, for the same reason my-mind.js itself is in MindMapCanvas.jsx:
 * those modules query the DOM (e.g. `#notes`, `#ui`) at import time, so
 * they must not load before this component's elements are attached to
 * the document.
 */
export default function NotesEditor() {
  let textareaEl;
  let easyMDE;
  let notesModule; // cached after the first dynamic import, see onMount

  const [mode, setMode] = createSignal("edit"); // "edit" | "view"
  const [content, setContent] = createSignal("");
  const [previewHtml, setPreviewHtml] = createSignal("");
  // Tracks whether notesModule/editorAPI are ready. The createEffect below
  // needs to react to *both* "the engine selected an item" and "our own
  // async setup finished" — whichever happens second. Without this signal,
  // if an item gets selected (e.g. on map load) before this component's
  // async easymde/notes.js imports resolve, onItemSelect() would run with
  // an undefined notesModule and silently do nothing — and nothing would
  // ever retrigger it afterwards, since currentItem() itself doesn't
  // change again just because our setup finished.
  const [ready, setReady] = createSignal(false);

  function toggleMode() {
    if (mode() === "edit") {
      setContent(easyMDE.value());
      setPreviewHtml(content() ? easyMDE.options.previewRender(content()) : "");
      setMode("view");
    } else {
      if (easyMDE.value() !== content()) {
        easyMDE.value(content());
      }
      setMode("edit");
      easyMDE.codemirror.refresh();
    }
  }

  onMount(async () => {
    easyMDE = new EasyMDE({
      element: textareaEl,
      autosave: { enabled: false },
      spellChecker: false,
      status: false,
      toolbar: [
        "bold",
        "italic",
        "strikethrough",
        "|",
        "heading-1",
        "heading-2",
        "heading-3",
        "|",
        "quote",
        "unordered-list",
        "ordered-list",
        "code",
        "|",
        "link",
        "image",
        "table",
        "horizontal-rule",
      ],
    });

    notesModule = await import("../lib/mindmap/ui/notes.js");

    easyMDE.codemirror.on("change", () => {
      const text = easyMDE.value();
      setContent(text);
      notesModule.onEditorChange(text);
    });

    notesModule.registerEditorAPI({
      setContent(text) {
        setContent(text || "");
        if (mode() === "edit") {
          if (easyMDE.value() !== content()) easyMDE.value(content());
        } else {
          setPreviewHtml(
            content() ? easyMDE.options.previewRender(content()) : "",
          );
        }
      },
      renderMarkdown(text) {
        return easyMDE.options.previewRender(text);
      },
    });

    setReady(true);
  });

  // Sync the notes editor and background preview whenever the selected
  // item changes, or once our async setup becomes ready — covers both
  // possible orderings of "item selected" vs "editor initialized".
  createEffect(() => {
    if (!ready()) {
      return;
    }
    notesModule.onItemSelect(currentItem());
  });

  onCleanup(() => easyMDE?.toTextArea());
  return (
    <div id="notes" class="pane" hidden>
      <div id="notes-editor">
        <div id="notes-editor-bar">
          <button onClick={() => notesModule?.close()}>Close</button>
          <span class="spacer" />
          <button onClick={toggleMode}>
            {mode() === "edit" ? "View" : "Edit"}
          </button>
        </div>
        <div id="notes-editor-edit-pane" hidden={mode() !== "edit"}>
          <textarea ref={textareaEl} />
        </div>
        <div
          id="notes-editor-view-pane"
          hidden={mode() !== "view"}
          innerHTML={previewHtml()}
        />
      </div>
    </div>
  );
}
