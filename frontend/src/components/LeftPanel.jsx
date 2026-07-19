import { A, useNavigate } from "@solidjs/router";
import { Show } from "solid-js";

import {
  leftPanelHidden,
  toggleLeftPanel,
  showSnapshots,
  helpHidden,
} from "../lib/mindmap/store";
import SnapshotsList from "./SnapshotsList";
import HelpPanel from "./HelpPanel";

import Book from "lucide-solid/icons/book";

import PanelLeft from "lucide-solid/icons/panel-left";
import FilePlus from "lucide-solid/icons/file-plus";
import CircleQuestionMark from "lucide-solid/icons/circle-question-mark";
import CloudUpload from "lucide-solid/icons/cloud-upload";
import Images from "lucide-solid/icons/images";
//import History from "lucide-solid/icons/history";
import DatabaseBackup from "lucide-solid/icons/database-backup";
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

  // Runs a command directly, the same way ui/ui.js's data-command click
  // delegation would. Used instead of that delegation because this panel
  // is moving out of MindMapCanvas.jsx's container (see CLAUDE.md,
  // Workspace shared-chrome refactor), so its buttons need to work
  // whether or not the canvas is the active workspace mode.
  async function runCommand(name) {
    const { execute } = await import("../lib/mindmap/command/command.js");
    execute(name);
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

        <button class="icon-btn" onClick={() => runCommand("new")} title="New">
          <FilePlus size={20} />
        </button>

        <A
          href="/catalog"
          class="icon-btn"
          title="Catalog"
          onClick={goToCatalog}
        >
          <Book size={20} />
        </A>

        <button
          class="icon-btn"
          onClick={() => runCommand("save")}
          title="Save"
        >
          <CloudUpload size={20} />
        </button>
        <button
          class="icon-btn"
          onClick={() => runCommand("save-as")}
          title="Save as"
        >
          <Images size={20} />
        </button>

        <button
          class="icon-btn"
          onClick={() => runCommand("recover")}
          title="Restore snapshot"
        >
          <DatabaseBackup size={20} />
        </button>
        <button
          class="icon-btn"
          onClick={() => runCommand("help")}
          title="Help"
        >
          <CircleQuestionMark size={20} />
        </button>
      </div>
      {/* Fades in only once the panel is wide enough to actually show its
          content. Shows the snapshot recovery list once the "recover"
          command has been triggered (see command/command.js); empty
          otherwise. */}
      <div
        class="min-w-0 flex-1 overflow-y-auto px-2 py-2 transition-opacity duration-200"
        classList={{
          "opacity-0": leftPanelHidden(),
          "pointer-events-none": leftPanelHidden(),
        }}
      >
        <Show when={showSnapshots()}>
          <SnapshotsList />
        </Show>
        <Show when={!helpHidden()}>
          <HelpPanel />
        </Show>
      </div>
    </div>
  );
}
