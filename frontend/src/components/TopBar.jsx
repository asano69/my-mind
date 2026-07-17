import { A, useNavigate } from "@solidjs/router";
import TitleBar from "./TitleBar";
// icons
import Book from "lucide-solid/icons/book";
import TextCursor from "lucide-solid/icons/text-cursor";
import Palette from "lucide-solid/icons/palette";
import Trash2 from "lucide-solid/icons/trash-2";
// The floating strip across the top of the canvas: the catalog icon
// (fixed top-left, via CSS) and the title input (fixed top-center,
// rendered by TitleBar). Extracted out of MindMapCanvas.jsx so the
// top-of-canvas UI lives in one place.
export default function TopBar() {
  const navigate = useNavigate();

  // Snapshot the map's SVG before leaving for the catalog, so its
  // thumbnail there is up to date (auto-save skips the SVG for speed).
  async function goToCatalog(e) {
    e.preventDefault();
    const io = await import("../lib/mindmap/ui/io.js");
    await io.saveWithSvg();
    navigate("/catalog");
  }

  // Deletes the currently open map (same backend call as Catalog.jsx's
  // delete button) and returns to the catalog afterwards.
  async function handleDelete() {
    if (!confirm("Delete this map?")) {
      return;
    }
    const io = await import("../lib/mindmap/ui/io.js");
    await io.deleteCurrentMap();
    navigate("/catalog");
  }

  return (
    <>
      <div class="topbar-left">
        <A
          href="/catalog"
          id="catalog-link"
          class="icon-btn"
          title="Catalog"
          onClick={goToCatalog}
        >
          <Book size={28} />
        </A>
      </div>

      <TitleBar />
      <div class="topbar-right">
      <button class="icon-btn" title="Delete map" onClick={handleDelete}>
          <Trash2 size={28} />
        </button>
        <button class="icon-btn" data-command="notes" title="Notes">
          <TextCursor size={28} />
        </button>
        <button
          class="icon-btn"
          id="toggle"
          data-command="ui"
          title="Toggle UI"
        >
          <Palette size={28} />
        </button>
      
      </div>
    </>
  );
}
