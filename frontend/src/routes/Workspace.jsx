import { activeMode } from "../lib/mindmap/store";
import NotesEditor from "../components/NotesEditor";
import MindMapCanvas from "./MindMapCanvas";

// Keeps the canvas and notes editor mounted together, then switches
// which layer is interactive via z-index and pointer-events only.
// Avoid display:none so Milkdown/ProseMirror does not need to recalculate
// its layout every time the workspace mode changes.
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
        class="fixed inset-0"
        classList={{ "pointer-events-none": activeMode() !== "notes" }}
        style={{ "z-index": activeMode() === "notes" ? 1 : 0 }}
      >
        <NotesEditor />
      </div>
    </>
  );
}
