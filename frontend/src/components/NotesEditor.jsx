import { createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { Crepe } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { marked } from "marked";
import "./NotesEditor.css";
import { currentItem } from "../lib/mindmap/store";

/**
 * The markdown notes editor for the currently selected item.
 *
 * Replaces the old EasyMDE-based editor with Milkdown's Crepe: a WYSIWYG
 * editor that edits markdown directly, so there is no more separate
 * edit/view toggle mode.
 *
 * A single Crepe instance lives for the whole component lifetime.
 * Switching items replaces its content via Milkdown's replaceAll() action
 * instead of destroying/recreating the editor. flush=true also resets
 * undo history per item, matching the old per-item EasyMDE.value() swap.
 */
export default function NotesEditor() {
  let containerEl;
  let crepe;
  let notesModule; // cached after the first dynamic import, see onMount
  const [ready, setReady] = createSignal(false);

  function setContent(text) {
    crepe.editor.action(replaceAll(text || "", true));
  }

  onMount(async () => {
    crepe = new Crepe({ root: containerEl, defaultValue: "" });
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        notesModule?.onEditorChange(markdown);
      });
    });
    await crepe.create();

    notesModule = await import("../lib/mindmap/ui/notes.js");
    notesModule.registerEditorAPI({
      setContent,
      // Only used for the background watermark preview (see ui/notes.js),
      // which needs a plain markdown -> HTML string, not a live editor.
      renderMarkdown: (text) => marked.parse(text || ""),
    });

    setReady(true);
  });

  // Sync the editor and background preview whenever the selected item
  // changes, or once our async setup becomes ready — covers both possible
  // orderings of "item selected" vs "editor initialized" (same reasoning
  // as the old EasyMDE-based component).
  createEffect(() => {
    if (!ready()) {
      return;
    }
    notesModule.onItemSelect(currentItem());
  });

  onCleanup(() => {
    crepe?.destroy();
  });

  return (
    <div id="notes" class="pane" hidden>
      <div id="notes-editor">
        <div id="notes-editor-bar">
          <button onClick={() => notesModule?.close()}>Close</button>
        </div>
        <div id="notes-editor-milkdown" ref={containerEl} />
      </div>
    </div>
  );
}
