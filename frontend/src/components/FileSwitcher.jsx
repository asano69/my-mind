import {
  createSignal,
  createResource,
  createEffect,
  onCleanup,
  For,
  Show,
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Dialog } from "@kobalte/core/dialog";
import { fileSwitcherOpen, closeFileSwitcher } from "../lib/mindmap/store";
import { listMaps } from "../lib/mindmap/backend/pocketbase";
import { useScopeWhen } from "mindmap-engine";
import Search from "./Search";
import Pin from "lucide-solid/icons/pin";

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString();
}

// The search box + results list. Mounted only while the dialog is open
// (see the <Show> in FileSwitcher below), so its query signal and
// createResource call are naturally torn down and recreated fresh every
// time Ctrl+K reopens it -- no manual reset logic needed.
function FileSwitcherPanel(props) {
  const navigate = useNavigate();
  const [query, setQuery] = createSignal("");
  const [maps] = createResource(query, listMaps);

  let searchInputRef;
  let listRef;

  // Mirrors CatalogList.jsx's handleOpen: refresh the thumbnail of the
  // map we're leaving, then navigate. Best-effort -- a failed save
  // should never block switching maps.
  async function handleSelect(uuid) {
    const io = await import("../lib/mindmap/ui/io.js");
    if (!(await io.confirmLeave())) {
      return;
    }
    props.onSelect();
    navigate(`/maps/${uuid}`);
  }

  // ArrowDown from the search box hands focus to the first result, so
  // the rest of the list can be reached without touching the mouse.
  function handleSearchKeyDown(e) {
    if (e.key !== "ArrowDown") {
      return;
    }
    e.preventDefault();
    listRef?.querySelector("button")?.focus();
  }

  // ArrowUp/ArrowDown move focus between result buttons (they're plain
  // siblings inside listRef, so next/previousElementSibling is enough --
  // no need to track an index). ArrowUp on the first result returns
  // focus to the search box instead of doing nothing. "/" jumps back to
  // the search box from anywhere in the list, mirroring the common
  // command-palette convention (e.g. GitHub's own "/" search shortcut),
  // regardless of which item currently has focus.
  function handleListKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.target.nextElementSibling?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = e.target.previousElementSibling;
      if (prev) {
        prev.focus();
      } else {
        searchInputRef?.focus();
      }
    } else if (e.key === "/") {
      e.preventDefault();
      searchInputRef?.focus();
    }
  }

  return (
    <>
      <div class="border-b border-pane-hover p-2">
        <Search
          ref={searchInputRef}
          onSearch={setQuery}
          onKeyDown={handleSearchKeyDown}
        />
      </div>
      <div ref={listRef} class="max-h-80 overflow-y-auto p-1">
        <Show
          when={!maps.loading}
          fallback={<p class="px-3 py-2 text-sm text-text/50">Loading…</p>}
        >
          <Show
            when={maps()?.length}
            fallback={
              <p class="px-3 py-2 text-sm text-text/50">No maps found.</p>
            }
          >
            <For each={maps()}>
              {(map) => (
                <button
                  onClick={() => handleSelect(map.uuid)}
                  onKeyDown={handleListKeyDown}
                  class="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm text-text hover:bg-hover focus:bg-hover focus:outline-none"
                >
                  <Show when={map.pin}>
                    {/* style.css has a global `svg { position: absolute }`
                        rule (see Logo.jsx's own icon for the same fix) --
                        without overriding it here, this icon is yanked out
                        of normal flow and stays put while the list around
                        it scrolls. */}
                    <span class="mr-1 flex h-4 w-4 flex-none items-center justify-center text-[#2ca02c]">
                      <Pin size={14} style={{ position: "static" }} />
                    </span>
                  </Show>
                  <span class="min-w-0 flex-1 truncate">
                    {map.title || "Untitled"}
                  </span>
                  <span class="flex-none text-xs text-text/50">
                    {formatDate(map.updated)}
                  </span>
                </button>
              )}
            </For>
          </Show>
        </Show>
      </div>
    </>
  );
}

// Ctrl+K command palette for jumping between maps (see command/command.js's
// "file-switcher" command). Titles only, no thumbnails -- kept simple so
// it's fast to scan while typing. Kobalte's Dialog focuses the first
// focusable descendant on open, so the search input gets focus without
// any extra wiring here.
export default function FileSwitcher() {
  // See ConfirmDialog.jsx's own comment on why this is needed -- the
  // search box here is exactly the kind of input document-level
  // clipboard listeners can't otherwise tell apart from the canvas by
  // DOM focus alone.
  useScopeWhen(fileSwitcherOpen, "file-switcher");

  function handleOpenChange(open) {
    if (!open) {
      closeFileSwitcher();
    }
  }

  // Pressing Ctrl+K again while the dialog is open closes it, mirroring
  // typical command-palette toggle behavior. This can't be handled by
  // command/command.js's "file-switcher" command (which only ever
  // opens): once the dialog is open, focus lives inside Kobalte's
  // Dialog.Content, rendered via a Portal outside MindMapCanvas.jsx's
  // containerRef -- so keyboard.js's containerEl-scoped keydown
  // listener never sees the keystroke at all. A window-level listener,
  // active only while the dialog is open, is the only way to catch it.
  // Capture phase so it runs before the search input (or focused result
  // button) would otherwise handle the keystroke.
  createEffect(() => {
    if (!fileSwitcherOpen()) {
      return;
    }
    function handleKeyDown(e) {
      if (e.code === "KeyK" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        closeFileSwitcher();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown, true));
  });

  // Kobalte's Dialog restores focus on close to whatever it recorded as
  // "previously active" when the dialog opened. Since this dialog opens
  // via a keyboard shortcut (command/command.js's "file-switcher"
  // command) rather than a clicked trigger element, that recorded
  // element is unreliable -- focus can end up on document.body instead
  // of the mindmap canvas. keyboard.js's own self-heal guard (see its
  // handleFocusOut) only fires when the canvas container *itself* loses
  // focus, which never happens here (the dialog's search input had
  // focus, not the container), so it can't rescue this case. Take over
  // focus restoration explicitly instead of relying on Kobalte's
  // default, or a second Ctrl+K press can leak into the browser's own
  // address bar shortcut.
  function handleCloseAutoFocus(e) {
    e.preventDefault();
    document.getElementById("mindmap-container")?.focus();
  }

  return (
    <Dialog open={fileSwitcherOpen()} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
        <div class="fixed inset-0 z-40 flex items-start justify-center p-4 pt-[15vh]">
          <Dialog.Content
            class="flex w-full max-w-md flex-col overflow-hidden rounded-md border border-pane-hover bg-pane shadow-card"
            onCloseAutoFocus={handleCloseAutoFocus}
          >
            <Dialog.Title class="sr-only">Switch map</Dialog.Title>
            <Show when={fileSwitcherOpen()}>
              <FileSwitcherPanel onSelect={closeFileSwitcher} />
            </Show>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
}
