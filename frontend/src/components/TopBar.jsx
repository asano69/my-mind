import { A, useNavigate } from "@solidjs/router";
import TitleBar from "./TitleBar";
import { Book, TextCursor, Palette } from "lucide-solid";

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

  return (
    <>
      <A
        href="/catalog"
        id="catalog-link"
        class="icon-btn"
        title="Catalog"
        onClick={goToCatalog}
      >
        <Book size={28} />
      </A>
      <TitleBar />

      <button class="icon-btn" data-command="notes" title="Notes">
        <TextCursor size={28} />
      </button>
      <button class="icon-btn" id="toggle" data-command="ui" title="Toggle UI">
        <Palette size={28} />
      </button>
    </>
  );
}
