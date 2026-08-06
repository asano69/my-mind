import { useNavigate } from "@solidjs/router";
import { createSignal, createMemo, onMount, onCleanup } from "solid-js";
import { rightPanelHidden } from "../lib/mindmap/store";

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
  const [title, setTitle] = createSignal("");

  // Undo/Redo button enablement mirrors ContextMenu.jsx's disabled logic
  // (commandRepo.get(id).isValid), which itself reads history.js's
  // historyVersion signal — see command/command.js's Undo/Redo commands.
  // Loaded lazily (dynamic import) like title.js above, since these
  // touch the engine bundle.
  let historyModule;
  let commandRepoRef;
  const [historyReady, setHistoryReady] = createSignal(false);

  function commitTitle(e) {
    titleModule?.rename(e.target.value);
  }

  onMount(async () => {
    titleModule = await import("../lib/mindmap/title.js");
    titleModule.registerInput({ setValue: setTitle });
    [historyModule, { repo: commandRepoRef }] = await Promise.all([
      import("../lib/mindmap/history.js"),
      import("../lib/mindmap/command/command.js"),
    ]);
    setHistoryReady(true);
  });

  const canUndo = createMemo(() => {
    if (!historyReady()) {
      return false;
    }
    historyModule.historyVersion();
    return commandRepoRef.get("undo").isValid;
  });
  const canRedo = createMemo(() => {
    if (!historyReady()) {
      return false;
    }
    historyModule.historyVersion();
    return commandRepoRef.get("redo").isValid;
  });

  // TopBar lives at the Workspace level and stays mounted across map
  // switches (only MindMapCanvas remounts, see Workspace.jsx's keyed
  // <Show>). It only truly unregisters when it unmounts itself, e.g.
  // leaving Workspace entirely for /catalog — not on every engine
  // mount()/unmount() cycle (see title.js's dispose()).
  onCleanup(() => {
    titleModule?.unregisterInput();
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

  // Runs a command directly instead of relying on ui/ui.js's data-command
  // click delegation, since TopBar moves out of MindMapCanvas.jsx's
  // container and must keep working while Notes mode is active (see
  // CLAUDE.md, Workspace shared-chrome refactor).
  async function runCommand(name) {
    const { execute } = await import("../lib/mindmap/command/command.js");
    execute(name);
  }

  return (
    <>
      <input
        type="text"
        value={title()}
        onInput={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="Untitled"
        class="fixed top-2 left-1/2 w-80 -translate-x-1/2 rounded-md
          border border-transparent bg-pane px-2 py-1 text-center
          font-serif text-lg text-text outline-none transition-colors
          hover:bg-pane-hover focus:border-pane-hover focus:bg-pane"
        style={{ "z-index": 10 }}
      />
      {/* Shifts left while the right property panel is expanded, so it
          never overlaps it. Reads the same store signal RightPanel.jsx
          uses, replacing the old `body:has(#ui.panel-expanded)` CSS
          hack in my-mind.css. */}
      <div
        class="fixed top-2 z-1 flex gap-4 transition-[right] duration-500 ease-in-out"
        style={{
          right: rightPanelHidden()
            ? "8px"
            : "calc(var(--side-panel-width) + 8px)",
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
