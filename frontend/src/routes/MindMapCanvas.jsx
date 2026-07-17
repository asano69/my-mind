import NotesEditor from "../components/NotesEditor";
import PropertyPanel from "../components/PropertyPanel";
import SaveDialog from "../components/SaveDialog";
import HelpPanel from "../components/HelpPanel";
import ContextMenu from "../components/ContextMenu";
import TopBar from "../components/TopBar";
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

    </>
  );
}
