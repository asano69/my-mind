import { A, useNavigate } from "@solidjs/router";

import { leftPanelHidden, toggleLeftPanel } from "../lib/mindmap/store";

import Book from "lucide-solid/icons/book";
import CircleQuestionMark from "lucide-solid/icons/circle-question-mark";
import PanelLeft from "lucide-solid/icons/panel-left";

// The left sidebar. Unlike #ui (which slides fully off-screen when
// hidden), this panel never leaves the screen — toggling it animates
// its own width between a narrow icons-only state and a wide state with
// room for future content (a snapshot list), ChatGPT/Claude-sidebar
// style. The icon column (.left-ribbon) stays pinned to the left edge
// either way, so Catalog/Help/the toggle itself are always reachable.
export default function LeftPanel() {
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
    <div
      id="left-panel"
      class="pane pane-left"
      classList={{ expanded: !leftPanelHidden() }}
    >
      <div class="left-ribbon">
        <A
          href="/catalog"
          class="icon-btn"
          title="Catalog"
          onClick={goToCatalog}
        >
          <Book size={28} />
        </A>
        <button class="icon-btn" data-command="help" title="Help">
          <CircleQuestionMark size={28} />
        </button>
        <button
          class="icon-btn"
          onClick={toggleLeftPanel}
          title="Toggle sidebar"
        >
          <PanelLeft size={28} />
        </button>
      </div>
      <div class="left-panel-content" />
    </div>
  );
}
