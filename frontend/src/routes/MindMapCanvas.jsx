import NotesEditor from "../components/NotesEditor";
import PropertyPanel from "../components/PropertyPanel";
import SaveDialog from "../components/SaveDialog";
import HelpPanel from "../components/HelpPanel";
import ContextMenu from "../components/ContextMenu";
import TopBar from "../components/TopBar";
import { onMount, onCleanup } from "solid-js";
import CircleQuestionMark from "lucide-solid/icons/circle-question-mark";

export default function MindMapCanvas() {
  let mainRef;
  let engine;

  onMount(async () => {
    engine = await import("../lib/mindmap/my-mind.js");
    engine.mount(mainRef);
  });

  onCleanup(() => {
    engine?.unmount();
  });

  return (
    <>
      <main ref={mainRef} />

      <TopBar />
      <PropertyPanel />
      <SaveDialog />
      <HelpPanel />
      <NotesEditor />
      <ContextMenu />

      <button id="help-btn" class="icon-btn" data-command="help" title="Help">
        <CircleQuestionMark size={28} />
      </button>
    </>
  );
}
