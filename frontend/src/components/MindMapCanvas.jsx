import NotesEditor from "./NotesEditor";
import PropertyPanel from "./PropertyPanel";
import SaveDialog from "./SaveDialog";
import HelpPanel from "./HelpPanel";
import ContextMenu from "./ContextMenu";
import TitleBar from "./TitleBar";
import { onMount, onCleanup } from "solid-js";

export default function MindMapCanvas() {
  let mainRef;
  // Cached after onMount's dynamic import, so onCleanup can call the same
  // module instance's unmount() without re-importing.
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
      <main ref={mainRef}>
        <a href="/catalog" id="catalog-link" class="icon-btn" title="Catalog">
          <img src="/icon/catalog.png" alt="Catalog" />
        </a>
      </main>

      <TitleBar />
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
