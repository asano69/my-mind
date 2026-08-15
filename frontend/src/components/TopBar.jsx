import { useNavigate } from "@solidjs/router";
import { createSignal, createMemo, onMount, Show } from "solid-js";
import { TextField } from "@kobalte/core/text-field";
import {
  rightPanelHidden,
  leftPanelHidden,
  currentTitle,
} from "../lib/mindmap/store";
import { useScopeWhen } from "../lib/mindmap/core/scope.js";

// icons
import Trash2 from "lucide-solid/icons/trash-2";
import TextCursor from "lucide-solid/icons/text-cursor";
import Save from "lucide-solid/icons/save";
import Undo from "lucide-solid/icons/undo";
import Redo from "lucide-solid/icons/redo";
import IconButton from "./IconButton";
import ConfirmDialog from "./ConfirmDialog";
// The floating strip across the top of the canvas: the title input
// (fixed top-center) and the right-hand icon group (delete/notes/
// property-panel toggle). Catalog/Help/the left panel toggle used to
// live here too, but moved to LeftPanel.jsx's permanent vertical
// ribbon so they stay visible even when the left panel is collapsed
// (see LeftPanel.jsx). Title editing used to be its own TitleBar.jsx
// component; folded in here since it always renders together with
// TopBar and the split added an extra file with no independent reason
// to exist.
//
// Interaction with the mindmap engine is delegated to title.js, using
// the "dynamic import + register API" bridge pattern: title.js touches
// live engine state (the current map) that only exists once
// my-mind.js has booted.
export default function TopBar() {
  const navigate = useNavigate();

  let titleModule; // cached after the first dynamic import, see onMount
  // Local buffer for the input while it's actively being edited. The
  // displayed (non-editing) title always reads store.js's currentTitle()
  // directly (see below) instead of being pushed a mirrored copy — see
  // title.js's init() for why the old push-based mirror was removed.
  const [editValue, setEditValue] = createSignal("");

  // Undo/Redo button enablement reads history.js directly -- it's
  // item-agnostic (a plain do()/undo() stack), so there's no need to go
  // through a command repo's isValid getter just to ask "is there
  // anything to undo/redo". Loaded lazily (dynamic import) like
  // title.js above, since it touches the engine bundle.
  let historyModule;
  const [historyReady, setHistoryReady] = createSignal(false);

  // Whether the title shows as plain text (click to edit) or as an
  // editable Kobalte TextField. Mirrors the click-to-edit pattern used
  // elsewhere in the app, instead of always rendering a styled-like-an-
  // input field.
  const [isEditingTitle, setIsEditingTitle] = createSignal(false);
  // See ConfirmDialog.jsx's own comment on why this is needed --
  // without it, pasting into this title input could be hijacked by
  // newClipboard.js's document-level paste handler.
  useScopeWhen(isEditingTitle, "title-edit");
  let titleInputRef;
  let titleBeforeEdit = "";

  function startEditingTitle() {
    titleBeforeEdit = currentTitle();
    setEditValue(titleBeforeEdit);
    setIsEditingTitle(true);
    // The input isn't mounted yet this tick (see the <Show> below), so
    // focus/select it once it is.
    queueMicrotask(() => {
      titleInputRef?.focus();
      titleInputRef?.select();
    });
  }

  // Returns focus to the mindmap container after the title editor
  // closes. This title input lives outside #mindmap-container (see
  // MindMapCanvas.jsx), so blurring or unmounting it leaves focus on
  // document.body instead of triggering a "focusout" on the container
  // that keyboard.js's own self-heal guard could catch (see
  // keyboard.js's handleFocusOut). Without this, a shortcut like
  // Ctrl+K falls through to the browser's own hotkey (e.g. focusing
  // the address bar) instead of reaching keyboard.js's listener.
  function returnFocusToCanvas() {
    document.getElementById("mindmap-container")?.focus();
  }

  // Guarded against re-entrancy: without this, cancelEditingTitle()
  // below could call this a second time from inside the title
  // <input>'s own onBlur, while the first call is still unwinding (see
  // that function's comment). Idempotent once editing has ended.
  function commitTitle() {
    if (!isEditingTitle()) {
      return;
    }
    setIsEditingTitle(false);
    titleModule?.rename(editValue());
    returnFocusToCanvas();
  }

  function cancelEditingTitle() {
    setEditValue(titleBeforeEdit);
    setIsEditingTitle(false);
    // Blur the input first, mirroring handleTitleKeyDown's Enter path
    // (e.currentTarget.blur()) -- never call container.focus() while
    // the input still holds focus. Calling .focus() on a different
    // element mid-transition (i.e. before the input has actually lost
    // focus) is a recursive focus() call: the browser's blur/focusout
    // handling for the input runs *inside* that still-unwinding
    // container.focus() call, which can leave document.activeElement
    // somewhere unexpected (often document.body) once it settles.
    // Since newKeyboard.js's shortcut listener is attached to the
    // container itself (not document, unlike newClipboard.js -- see
    // docs/d01-clipboard-event-targeting.md), keydown events then have
    // nowhere to bubble from, and its own focusout-based self-heal
    // guard never fires either, since the container never actually
    // had focus to lose here. Blurring first keeps this a plain,
    // single "A loses focus, then B gains it" transition -- the same
    // shape core/scope.js's own DOM-driven "form-field" scope (and
    // containerEl's real focus requirement) already assume -- instead
    // of two overlapping focus() calls racing each other.
    titleInputRef?.blur();
    returnFocusToCanvas();
  }

  function handleTitleKeyDown(e) {
    if (e.key === "Enter") {
      e.currentTarget.blur(); // triggers commitTitle via onBlur
    } else if (e.key === "Escape") {
      cancelEditingTitle();
    }
  }

  onMount(async () => {
    titleModule = await import("../lib/mindmap/title.js");
    historyModule = await import("../lib/mindmap/core/history.js");
    setHistoryReady(true);
  });

  const canUndo = createMemo(() => {
    if (!historyReady()) {
      return false;
    }
    historyModule.historyVersion();
    return historyModule.canBack();
  });
  const canRedo = createMemo(() => {
    if (!historyReady()) {
      return false;
    }
    historyModule.historyVersion();
    return historyModule.canForward();
  });

  const [confirmDeleteOpen, setConfirmDeleteOpen] = createSignal(false);

  // Deletes the currently open map (same backend call as Catalog.jsx's
  // delete button) and returns to the catalog afterwards. Confirmation
  // is handled by ConfirmDialog (see render below) instead of a native
  // confirm() popup.
  async function handleDelete() {
    const io = await import("../lib/mindmap/ui/io.js");
    await io.deleteCurrentMap();
    navigate("/catalog");
  }

  // Runs a command directly against the shared command repo, since
  // TopBar lives outside the canvas container and must keep working
  // while Notes mode is active (see CLAUDE.md, Workspace shared-chrome
  // refactor).
  async function runCommand(name) {
    const { repo } = await import("../lib/mindmap/newContextMenuCommands.js");
    repo.get(name).execute();
  }

  return (
    <>
      {/* Positioned right next to the left panel (ribbon or expanded)
          instead of screen-center, so it moves together with the
          sidebar's own width transition rather than floating
          independently in the middle of the screen. No fixed width here:
          the button already hugs its text via padding, and the input
          below uses field-sizing:content so its box tracks the actual
          rendered text width -- correct for mixed half-width/full-width
          characters, unlike an estimate based on character count. */}
      <div
        class="fixed top-2 z-[10] transition-[left] duration-300 ease-in-out"
        style={{
          left: leftPanelHidden()
            ? "calc(var(--ribbon-width) + 8px)"
            : "calc(var(--side-panel-width) + 8px)",
        }}
      >
        <Show
          when={isEditingTitle()}
          fallback={
            <button
              type="button"
              onClick={startEditingTitle}
              // font-family set via inline style, not the (now removed)
              // "font-serif" class: this title must never render serif,
              // not even briefly. map.css injects an unlayered
              // `* { font-family: sans }` rule that always beats a
              // layered Tailwind utility class, so before the map's
              // <style> tag is inserted this button used to flash serif
              // for one frame. Pinning font-family inline removes the
              // dependency on load order entirely.
              class="truncate rounded-md border border-transparent px-2
                py-1 text-left text-lg font-semibold text-text
                transition-colors hover:bg-pane-hover"
              style={{ "font-family": "var(--font-sans)" }}
            >
              {currentTitle() || "Untitled"}
            </button>
          }
        >
          <TextField value={editValue()} onChange={setEditValue}>
            <TextField.Input
              ref={titleInputRef}
              onBlur={commitTitle}
              onKeyDown={handleTitleKeyDown}
              placeholder="Untitled"
              // Same inline-style fix as the button above, kept in sync
              // so switching between display/edit mode never changes
              // the font.
              style={{
                "field-sizing": "content",
                "font-family": "var(--font-sans)",
              }}
              class="rounded-md border border-pane-hover bg-pane px-2 py-1
                text-left text-lg font-semibold text-text
                outline-none"
            />
          </TextField>
        </Show>
      </div>
      {/* Shifts left while the right property panel is expanded, so it
          never overlaps it. Reads the same store signal RightPanel.jsx
          uses, replacing the old `body:has(#ui.panel-expanded)` CSS
          hack in my-mind.css. */}
      <div
        class="fixed top-2 z-1 flex gap-4 transition-[right] duration-500 ease-in-out"
        style={{
          right: rightPanelHidden()
            ? "8px"
            : "calc(var(--right-panel-width) + 8px)",
        }}
      >
        <IconButton
          onClick={() => runCommand("undo")}
          title="Undo"
          disabled={!canUndo()}
        >
          <Undo size={28} />
        </IconButton>

        <IconButton
          onClick={() => runCommand("redo")}
          title="Redo"
          disabled={!canRedo()}
        >
          <Redo size={28} />
        </IconButton>

        <IconButton onClick={() => runCommand("save")} title="Save">
          <Save size={28} />
        </IconButton>

        <IconButton onClick={() => runCommand("notes")} title="Notes">
          <TextCursor size={28} />
        </IconButton>

        <IconButton
          onClick={() => setConfirmDeleteOpen(true)}
          title="Delete map"
        >
          <Trash2 size={28} />
        </IconButton>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen()}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete this map?"
        description="This cannot be undone."
        onConfirm={handleDelete}
      />
    </>
  );
}
