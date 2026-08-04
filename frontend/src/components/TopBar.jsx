import { useNavigate } from "@solidjs/router";
import { createSignal, onMount, onCleanup } from "solid-js";

// icons
import Trash2 from "lucide-solid/icons/trash-2";
import TextCursor from "lucide-solid/icons/text-cursor";
import Save from "lucide-solid/icons/save";
import IconButton from "./IconButton";
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

  function commitTitle(e) {
    titleModule?.rename(e.target.value);
  }

  onMount(async () => {
    titleModule = await import("../lib/mindmap/title.js");
    titleModule.registerInput({ setValue: setTitle });
  });

  // TopBar lives at the Workspace level and stays mounted across map
  // switches (only MindMapCanvas remounts, see Workspace.jsx's keyed
  // <Show>). It only truly unregisters when it unmounts itself, e.g.
  // leaving Workspace entirely for /catalog — not on every engine
  // mount()/unmount() cycle (see title.js's dispose()).
  onCleanup(() => {
    titleModule?.unregisterInput();
  });

  // Deletes the currently open map (same backend call as Catalog.jsx's
  // delete button) and returns to the catalog afterwards.
  async function handleDelete() {
    if (!confirm("Delete this map?")) {
      return;
    }
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
      <div class="topbar-right">
        <IconButton onClick={() => runCommand("save")} title="Save">
          <Save size={28} />
        </IconButton>

        <IconButton onClick={() => runCommand("notes")} title="Notes">
          <TextCursor size={28} />
        </IconButton>

        <IconButton onClick={handleDelete} title="Delete map">
          <Trash2 size={28} />
        </IconButton>
      </div>
    </>
  );
}
