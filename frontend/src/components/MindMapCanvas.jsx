import NotesEditor from "./NotesEditor";
import PropertyPanel from "./PropertyPanel";
import SaveDialog from "./SaveDialog";
import HelpPanel from "./HelpPanel";
import ContextMenu from "./ContextMenu";
import TopBar from "./TopBar";
import { onMount, onCleanup } from "solid-js";

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
        <img src="/icon/help.png" alt="Help" />
      </button>
    </>
  );
}
