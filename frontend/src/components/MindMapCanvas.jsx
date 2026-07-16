import { A, useNavigate } from "@solidjs/router";
import NotesEditor from "./NotesEditor";
import PropertyPanel from "./PropertyPanel";
import SaveDialog from "./SaveDialog";
import HelpPanel from "./HelpPanel";
import ContextMenu from "./ContextMenu";
import TitleBar from "./TitleBar";
import { onMount, onCleanup } from "solid-js";

export default function MindMapCanvas() {
  let mainRef;
  let engine;
  const navigate = useNavigate();

  onMount(async () => {
    engine = await import("../lib/mindmap/my-mind.js");
    engine.mount(mainRef);
  });

  onCleanup(() => {
    engine?.unmount();
  });

  // Snapshot the map's SVG before leaving for the catalog, so its
  // thumbnail there is up to date (auto-save skips the SVG for speed).
  async function goToCatalog(e) {
    e.preventDefault();
    const io = await import("../lib/mindmap/ui/io.js");
    await io.saveWithSvg();
    navigate("/catalog");
  }

  return (
    <>
      <main ref={mainRef}>
        <A
          href="/catalog"
          id="catalog-link"
          class="icon-btn"
          title="Catalog"
          onClick={goToCatalog}
        >
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
