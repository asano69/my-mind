import MindMapCanvas from "./MindMapCanvas";
import NotesEditor from "../components/NotesEditor";

// Wraps MindMapCanvas and NotesEditor as siblings, both mounted at once,
// instead of NotesEditor living inside MindMapCanvas.jsx. This is the
// first step toward switching which one is on top via activeMode (see
// docs/03.2-workspace-mode-switch-refactor.md, Phase 2) — front/back
// CSS layering is not applied yet, so this should look identical to
// before.
export default function Workspace() {
  return (
    <>
      <MindMapCanvas />
      <NotesEditor />
    </>
  );
}
