import NotesEditor from "./NotesEditor";
import PropertyPanel from "./PropertyPanel";
import SaveDialog from "./SaveDialog";
import HelpPanel from "./HelpPanel";
import ContextMenu from "./ContextMenu";
import { onMount } from "solid-js";

// Renders the exact DOM structure the legacy mind-map engine expects
// (#ui, #io, #help, #notes, #context-menu, #help-btn, and the <main>
// element the engine mounts the SVG map into), delegating each pane to
// its own subcomponent. The engine itself is imported dynamically inside
// onMount so its module-level `document.querySelector(...)` calls run
// only after this markup is actually attached to the real DOM.
export default function MindMapCanvas() {
  onMount(() => {
    import("../lib/mindmap/my-mind.js");
  });

  return (
    <>
      <main>
        <button
          id="catalog-link"
          class="icon-btn"
          data-command="go-to-catalog"
          title="Catalog"
        >
          <img src="/icon/catalog.png" alt="Catalog" />
        </button>
      </main>

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
