import { A, useNavigate } from "@solidjs/router";

import { leftPanelHidden, toggleLeftPanel } from "../lib/mindmap/store";

import Book from "lucide-solid/icons/book";
import CircleQuestionMark from "lucide-solid/icons/circle-question-mark";
import PanelLeft from "lucide-solid/icons/panel-left";
import FilePlus from "lucide-solid/icons/file-plus";
import FolderOpen from "lucide-solid/icons/folder-open";
import CloudUpload from "lucide-solid/icons/cloud-upload";
import Images from "lucide-solid/icons/images";

// The left sidebar. All positioning/animation lives here as Tailwind
// utilities instead of my-mind.css's `.pane`/`.pane-left` — `.pane` is a
// right-docked (right:0) base class shared by #ui/#io/#notes/#help, and
// `.pane-left` never had any overriding rules, which is why this panel
// used to render stacked on the *right* sidebar.
//
// Unlike the right panel (which slides fully off-screen when hidden), this
// one never leaves the screen: toggling it animates its own width between
// a narrow icons-only "ribbon" and a wide "panel", ChatGPT/Claude-sidebar
// style. The icon column stays pinned to the left edge either way, so
// Catalog/Help/the toggle itself are always reachable.
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
      class="fixed inset-y-0 left-0 z-5 flex overflow-hidden bg-pane shadow-card transition-[width] duration-300 ease-in-out"
      style={{
        width: leftPanelHidden()
          ? "var(--ribbon-width)"
          : "var(--side-panel-width)",
      }}
    >
      <div class="flex w-[var(--ribbon-width)] flex-shrink-0 flex-col items-center gap-2 py-2">
        <button
          class="icon-btn"
          onClick={toggleLeftPanel}
          title="Toggle sidebar"
        >
          <PanelLeft size={20} />
        </button>
        <A
          href="/catalog"
          class="icon-btn"
          title="Catalog"
          onClick={goToCatalog}
        >
          <Book size={20} />
        </A>
        <button class="icon-btn" data-command="help" title="Help">
          <CircleQuestionMark size={20} />
        </button>
        <button class="icon-btn" data-command="new" title="New">
          <FilePlus size={20} />
        </button>

        <button class="icon-btn" data-command="load" title="Open">
          <FolderOpen size={20} />
        </button>
        <button class="icon-btn" data-command="save" title="Save">
          <CloudUpload size={20} />
        </button>
        <button class="icon-btn" data-command="save-as" title="Save as">
          <Images size={20} />
        </button>
      </div>
      {/* Reserved for future content (e.g. a snapshot list). Fades in only
          once the panel is wide enough to actually show it. */}
      <div
        class="min-w-0 flex-1 overflow-y-auto px-2 py-2 transition-opacity duration-200"
        classList={{
          "opacity-0": leftPanelHidden(),
          "pointer-events-none": leftPanelHidden(),
        }}
      />
    </div>
  );
}
