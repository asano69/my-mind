import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { replaceAll } from "@milkdown/utils";
import { marked } from "marked";
import "./NotesEditor.css";
import { activeMode, currentItem } from "../lib/mindmap/store";
import { createEffect, createSignal, on, onMount, onCleanup } from "solid-js";

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
  let editorRootEl;
  let crepe;
  let notesModule; // cached after the first dynamic import, see onMount
  let applyingExternalContent = false;

  // Tracks whether notesModule/editorAPI are ready. The createEffect below
  // needs to react to *both* "the engine selected an item" and "our own
  // async setup finished" — whichever happens second. Without this signal,
  // if an item gets selected (e.g. on map load) before this component's
  // async milkdown/notes.js imports resolve, onItemSelect() would run with
  // an undefined notesModule and silently do nothing — and nothing would
  // ever retrigger it afterwards, since currentItem() itself doesn't
  // change again just because our setup finished.
  const [ready, setReady] = createSignal(false);

  function setMarkdown(text) {
    const next = text || "";
    if (crepe.getMarkdown() === next) {
      return;
    }

    applyingExternalContent = true;
    crepe.editor.action(replaceAll(next, true));
    applyingExternalContent = false;
  }

  onMount(async () => {
    crepe = new Crepe({ root: editorRootEl, defaultValue: "" });

    crepe.on((listener) => {
      listener.markdownUpdated((_, markdown) => {
        if (applyingExternalContent) {
          return;
        }
        notesModule?.onEditorChange(markdown);
      });
    });

    await crepe.create();
    crepe.setReadonly(activeMode() !== "notes");
    notesModule = await import("../lib/mindmap/ui/notes.js");

    notesModule.registerEditorAPI({
      setContent: setMarkdown,
      renderMarkdown(text) {
        return marked.parse(text || "");
      },
    });

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

  createEffect(
    on([ready, activeMode], ([isReady, mode]) => {
      if (!isReady) {
        return;
      }
      crepe.setReadonly(mode !== "notes");
    }),
  );

  onCleanup(() => {
    crepe?.destroy();
  });

  return (
    <div id="notes" class="h-full">
      <div id="notes-editor">
        <div id="notes-editor-bar">
          <button onClick={() => notesModule?.close()}>Close</button>
        </div>
        <div id="notes-editor-crepe" ref={editorRootEl} />
      </div>
    </div>
  );
}
