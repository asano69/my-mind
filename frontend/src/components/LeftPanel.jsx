import { A, useNavigate } from "@solidjs/router";
import { Show } from "solid-js";
import {
  leftPanelHidden,
  setLeftPanelHidden,
  toggleLeftPanel,
  showSnapshots,
  showCatalogList,
  helpHidden,
} from "../lib/mindmap/store";
import SnapshotsList from "./SnapshotsList";
import CatalogList from "./CatalogList";
import HelpPanel from "./HelpPanel";
import IconButton, { iconButtonClass } from "./IconButton";

import FolderOpen from "lucide-solid/icons/folder-open";
import Book from "lucide-solid/icons/book";

import PanelLeft from "lucide-solid/icons/panel-left";
import FilePlus from "lucide-solid/icons/file-plus";

import CircleQuestionMark from "lucide-solid/icons/circle-question-mark";

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

  // Title for the fixed pane header above the scrollable content area
  // (see the render below). Mirrors the same three-way branch used to
  // pick which list component renders.
  const paneTitle = () => {
    if (showSnapshots()) {
      return "Snapshots";
    }
    if (!helpHidden()) {
      return "Help";
    }
    return "Catalog";
  };

  // Closing the panel leaves focus on this toggle button, which lives
  // outside MindMapCanvas.jsx's containerRef (LeftPanel is a Workspace-
  // level sibling, not a child of the canvas container). keyboard.js's
  // keydown listener is scoped to containerEl, so any shortcut (e.g.
  // Ctrl+K) stops working until focus lands back inside it -- and
  // keyboard.js's own self-heal guard only fires when containerEl
  // itself loses focus, which never happened here since it was never
  // focused to begin with. Explicitly hand focus back, same fix as
  // FileSwitcher.jsx's onCloseAutoFocus. Only when *closing*: leaving
  // it open means the user is about to interact with the sidebar, so
  // stealing focus there would be counterproductive.
  function handleToggleLeftPanel() {
    toggleLeftPanel();
    if (leftPanelHidden()) {
      document.getElementById("mindmap-container")?.focus();
    }
  }

  // Escape collapses the panel, but only while focus is actually inside
  // it (this handler is attached to the panel's own root div, so it
  // only fires while a descendant -- a search input, a list button, the
  // toggle icon itself, ... -- has focus and the keydown bubbles up
  // through this element). This is the opposite direction of
  // keyboard.js's canvas-scoped Escape (Cancel command, see
  // command/edit.js): that one is scoped to the canvas container and
  // must NOT reach into this panel, since containerEl and this panel
  // are DOM siblings, not ancestor/descendant -- Escape pressed while
  // the canvas is focused never bubbles here, and vice versa. Each side
  // owns Escape only for its own focus scope.
  function handlePanelKeyDown(e) {
    if (e.key !== "Escape" || leftPanelHidden()) {
      return;
    }
    e.stopPropagation();
    setLeftPanelHidden(true);
    document.getElementById("mindmap-container")?.focus();
  }

  // Snapshot the map's SVG before leaving for the catalog, so its
  // thumbnail there is up to date (auto-save skips the SVG for speed).
  async function goToCatalog(e) {
    e.preventDefault();
    const io = await import("../lib/mindmap/ui/io.js");
    await io.saveBeforeLeaving();
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
      onKeyDown={handlePanelKeyDown}
      class="fixed inset-y-0 left-0 z-5 flex overflow-hidden bg-pane shadow-card transition-[width] duration-300 ease-in-out"
      style={{
        width: leftPanelHidden()
          ? "var(--ribbon-width)"
          : "var(--side-panel-width)",
      }}
    >
      <div class="flex w-[var(--ribbon-width)] flex-shrink-0 flex-col items-center gap-2 py-2">
        <IconButton onClick={handleToggleLeftPanel} title="Toggle sidebar">
          <PanelLeft size={20} />
        </IconButton>

        <IconButton onClick={() => runCommand("new")} title="New">
          <FilePlus size={20} />
        </IconButton>

        <IconButton
          onClick={() => runCommand("catalog-list")}
          title="Browse maps"
        >
          <FolderOpen size={20} />
        </IconButton>

        <A
          href="/catalog"
          class={iconButtonClass}
          title="Catalog"
          onClick={goToCatalog}
        >
          <Book size={20} />
        </A>

        <IconButton onClick={() => runCommand("save-as")} title="Save as">
          <Images size={20} />
        </IconButton>

        <IconButton
          onClick={() => runCommand("recover")}
          title="Restore snapshot"
        >
          <DatabaseBackup size={20} />
        </IconButton>
        <IconButton onClick={() => runCommand("help")} title="Help">
          <CircleQuestionMark size={20} />
        </IconButton>
      </div>
      {/* Fades in only once the panel is wide enough to actually show its
          content. Shows the snapshot recovery list once the "recover"
          command has been triggered (see command/command.js); empty
          otherwise. */}
      <div
        class="flex min-w-0 flex-1 flex-col overflow-hidden transition-opacity duration-200"
        classList={{
          "opacity-0": leftPanelHidden(),
          "pointer-events-none": leftPanelHidden(),
        }}
      >
        {/* Fixed pane header, mirroring RightPanel.jsx's own Logo header
            (same border-b treatment). One level more abstract than
            HelpPanel.jsx's internal section headings (larger, non-
            uppercase), so it reads as "which pane is this" rather than
            competing with Help's own section labels. */}
        <div class="flex-none border-b border-black/10 px-1 py-1.5">
          {/* font-family set via inline style, not the "font-serif" class:
              map.css injects an unlayered `* { font-family: sans }` rule
              (see item.js/map.js's raw <style> import), which always beats
              any layered Tailwind utility class regardless of specificity.
              Without this, the title renders serif only until the map's
              <style> tag is inserted, then silently flips to sans. Same
              fix Logo.jsx already uses for its own title text. */}
          <p
            class="truncate text-base font-semibold text-text"
            style={{ "font-family": "var(--font-serif)" }}
          >
            {paneTitle()}
          </p>
        </div>
        <div class="min-w-0 flex-1 overflow-y-auto px-2 py-2">
          <Show when={showSnapshots()}>
            <SnapshotsList />
          </Show>
          {/* Default fallback: when neither snapshots nor help is being
              shown, display the maps browser instead of leaving the panel
              blank (covers both the explicit "catalog-list" command and
              the panel's default just-opened state). */}
          <Show when={showCatalogList() || (!showSnapshots() && helpHidden())}>
            <CatalogList />
          </Show>
          <Show when={!helpHidden()}>
            <HelpPanel />
          </Show>
        </div>
      </div>
    </div>
  );
}
