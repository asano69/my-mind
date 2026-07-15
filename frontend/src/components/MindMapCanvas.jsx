import NotesEditor from "./NotesEditor";
import PropertyPanel from "./PropertyPanel";
import SaveDialog from "./SaveDialog";
import HelpPanel from "./HelpPanel";
import ContextMenu from "./ContextMenu";
import TitleBar from "./TitleBar";
import { onMount } from "solid-js";
import { A } from "@solidjs/router";

export default function MindMapCanvas() {
  onMount(() => {
    import("../lib/mindmap/my-mind.js");
  });

  return (
    <>
      <main>
        <A href="/catalog" id="catalog-link" class="icon-btn" title="Catalog">
          <img src="/icon/catalog.png" alt="Catalog" />
        </A>
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
