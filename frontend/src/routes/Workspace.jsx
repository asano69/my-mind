import { useParams } from "@solidjs/router";
import { Show, createEffect } from "solid-js";
import { activeMode, leftPanelHidden } from "../lib/mindmap/store";
import NotesEditor from "../components/NotesEditor";
import MindMapCanvas from "../components/MindMapCanvas";
import TopBar from "../components/TopBar";
import LeftPanel from "../components/LeftPanel";

export default function Workspace() {
  const params = useParams();

  // "/maps/new" is not a real map id — treat it the same as no uuid at
  // all, so MindMapCanvas/io.restore() create a fresh, unsaved map
  // instead of trying to look up a map literally named "new".
  const uuid = () => (params.uuid === "new" ? undefined : params.uuid);

  createEffect(() => {
    console.log("[Workspace] params.uuid changed to", params.uuid);
  });

  return (
    <>
      <div
        class="fixed inset-0"
        classList={{ "pointer-events-none": activeMode() !== "canvas" }}
        style={{ "z-index": activeMode() === "canvas" ? 1 : 0 }}
      >
        <Show when={params.uuid ?? "__new__"} keyed>
          {(key) => {
            console.log("[Workspace] Show children re-created, key =", key);
            return <MindMapCanvas uuid={uuid()} />;
          }}
        </Show>
      </div>

      <div
        class="fixed inset-0 transition-[margin-left] duration-300 ease-in-out"
        classList={{ "pointer-events-none": activeMode() !== "notes" }}
        style={{
          "z-index": activeMode() === "notes" ? 1 : 0,
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
