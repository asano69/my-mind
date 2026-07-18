import { activeMode, leftPanelHidden } from "../lib/mindmap/store";
import NotesEditor from "../components/NotesEditor";
import MindMapCanvas from "../components/MindMapCanvas";
import TopBar from "../components/TopBar";
import LeftPanel from "../components/LeftPanel";

// Keeps the canvas and notes editor mounted together, then switches
// which layer is interactive via z-index and pointer-events only.
// Avoid display:none so Milkdown/ProseMirror does not need to recalculate
// its layout every time the workspace mode changes.
//
// TopBar/LeftPanel live here, outside both per-mode wrappers, because
// they are shared chrome: both canvas and notes mode need working
// new/save/help/notes/delete controls, not just canvas mode (see
// CLAUDE.md, Workspace shared-chrome refactor). Both render only
// position:fixed content, so lifting them out of MindMapCanvas's DOM
// subtree does not change their on-screen position or stacking order.
export default function Workspace() {
  return (
    <>
      <div
        class="fixed inset-0"
        classList={{ "pointer-events-none": activeMode() !== "canvas" }}
        style={{ "z-index": activeMode() === "canvas" ? 1 : 0 }}
      >
        <MindMapCanvas />
      </div>
      <div
        class="fixed inset-0 transition-[margin-left] duration-300 ease-in-out"
        classList={{ "pointer-events-none": activeMode() !== "notes" }}
        style={{
          "z-index": activeMode() === "notes" ? 1 : 0,
          // Mirrors the offset MindMapCanvas's <main> gets from
          // my-mind.js's handleResize(), so the notes pane slides in step
          // with the left sidebar instead of sitting underneath it.
          "margin-left": leftPanelHidden()
            ? "var(--ribbon-width)"
            : "var(--side-panel-width)",
        }}
      >
        <NotesEditor />
      </div>

      <TopBar />
      <LeftPanel />
    </>
  );
}
