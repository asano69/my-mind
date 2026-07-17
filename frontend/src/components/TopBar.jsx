import { A, useNavigate } from "@solidjs/router";
import TitleBar from "./TitleBar";

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
        <img src="/icon/catalog.png" alt="Catalog" />
      </A>
      <TitleBar />
    </>
  );
}
