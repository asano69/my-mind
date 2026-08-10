import { createResource, createSignal, For, Show } from "solid-js";

import { A, useNavigate } from "@solidjs/router";
//import Logo from "../components/Logo";
import Search from "../components/Search";
import Spinner from "../components/Spinner";
import IconButton, { iconButtonClass } from "../components/IconButton";
import FilePlus from "lucide-solid/icons/file-plus";
import Settings2 from "lucide-solid/icons/settings-2";
import Check from "lucide-solid/icons/check";
import Trash2 from "lucide-solid/icons/trash-2";
import Pin from "lucide-solid/icons/pin";
import Logo from "../components/Logo";

import {
  listMaps,
  updateTitle,
  updatePin,
  deleteMap,
} from "../lib/mindmap/backend/pocketbase";
import ConfirmDialog from "../components/ConfirmDialog";
import { showToast } from "../lib/mindmap/ui/toast.jsx";

export default function Catalog() {
  const navigate = useNavigate();
  const [query, setQuery] = createSignal("");
  // Re-fetches from PocketBase whenever query() changes.
  const [maps, { mutate, refetch }] = createResource(query, listMaps);
  const [editMode, setEditMode] = createSignal(false);

  const [pendingDeleteId, setPendingDeleteId] = createSignal(null);

  // Confirmation is handled by ConfirmDialog (see render below) instead
  // of a native confirm() popup.
  async function confirmDelete() {
    const id = pendingDeleteId();
    if (!id) return;
    const deleted = maps()?.find((m) => m.id === id);
    await deleteMap(id);
    mutate((prev) => prev.filter((m) => m.id !== id));
    showToast("Map deleted", deleted?.title || "Untitled");
  }

  async function handleRename(map, newTitle) {
    const trimmed = newTitle.trim();
    if (trimmed === (map.title || "")) return;
    await updateTitle(map.id, trimmed);
    mutate((prev) =>
      prev.map((m) => (m.id === map.id ? { ...m, title: trimmed } : m)),
    );
  }

  // Toggles pin state and re-sorts (pinned maps first) to match the
  // server-side ordering without waiting for a full refetch.
  async function handleTogglePin(map) {
    const nextPin = !map.pin;
    await updatePin(map.id, nextPin);
    mutate((prev) =>
      prev
        .map((m) => (m.id === map.id ? { ...m, pin: nextPin } : m))
        .sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0)),
    );
    showToast(nextPin ? "Pinned" : "Unpinned", map.title || "Untitled");
  }

  return (
    <div class="h-screen overflow-y-auto bg-bg p-8 text-text">
      <div class="mx-auto max-w-5xl">
        <div class="mb-6 flex items-center justify-between">
          {/* Clicking the logo re-fetches the map list, refreshing
              thumbnails that may be stale (e.g. after editing a map in
              another tab). Mirrors RightPanel.jsx's logo, which
              force-remounts the canvas for the same "something looks
              stale/broken, force a refresh" purpose. */}
          <Logo showTitle onClick={refetch} title="Refresh maps" />
          <div class="flex gap-2">
            <IconButton
              onClick={() => setEditMode(!editMode())}
              title={editMode() ? "Done" : "Edit"}
            >
              <Show when={editMode()} fallback={<Settings2 size={28} />}>
                <Check size={28} />
              </Show>
            </IconButton>
            <A href="/maps/new" class={iconButtonClass} title="New">
              <FilePlus size={28} />
            </A>
          </div>
        </div>
        <div class="mb-6">
          <Search onSearch={setQuery} />
        </div>

        <Show
          when={!maps.loading}
          fallback={
            <Spinner visible={true} class="relative mx-auto h-10 w-10" />
          }
        >
          <Show when={!maps.error} fallback={<p>Failed to load maps.</p>}>
            <Show
              when={maps()?.length}
              fallback={
                <p class="text-text/50">
                  {query() ? "No matching maps." : "No maps yet."}
                </p>
              }
            >
              <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                <For each={maps()}>
                  {(map) => (
                    <div
                      onClick={() =>
                        !editMode() && navigate(`/maps/${map.uuid}`)
                      }
                      class="flex flex-col overflow-hidden rounded-md border border-pane-hover bg-pane text-left shadow-card transition hover:bg-pane-hover"
                      classList={{ "cursor-pointer": !editMode() }}
                    >
                      <div class="relative flex h-32 items-center justify-center overflow-hidden bg-bg">
                        {/* Server-rendered image (see
                            backend/pocketbase.js's listMaps() comment)
                            instead of innerHTML, so this SVG's embedded
                            <style> can't leak into the page.
                            The "updated" timestamp is appended as a
                            cache-busting query param: the image URL
                            itself never changes when a map is edited, so
                            without this the browser can keep serving a
                            stale cached SVG even after listMaps() has
                            already refetched fresh metadata (e.g. when
                            navigating back to this page). */}
                        <img
                          src={`/maps/${map.uuid}/svg?t=${encodeURIComponent(map.updated)}`}
                          alt=""
                          class="pointer-events-none h-full w-full select-none object-contain p-2"
                        />

                        {/* style.css's global `svg { position: absolute }`
                            rule (see Logo.jsx) would otherwise apply to
                            these icons too -- override back to static so
                            they stay correctly positioned by their
                            wrapping span/button instead of by that rule. */}
                        <Show when={!editMode() && map.pin}>
                          <span class="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-[#2ca02c] drop-shadow">
                            <Pin size={16} style={{ position: "static" }} />
                          </span>
                        </Show>
                        <Show when={editMode()}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTogglePin(map);
                            }}
                            title={map.pin ? "Unpin" : "Pin"}
                            class="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/70 drop-shadow"
                            classList={{
                              "text-[#2ca02c]": map.pin,
                              "text-text/40": !map.pin,
                            }}
                          >
                            <Pin size={16} style={{ position: "static" }} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDeleteId(map.id);
                            }}
                            title="Delete"
                            class="absolute top-1 left-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-[#cc0000] drop-shadow"
                          >
                            <Trash2 size={16} style={{ position: "static" }} />
                          </button>
                        </Show>
                      </div>

                      <div class="flex items-center gap-1 px-3 py-2">
                        <Show
                          when={editMode()}
                          fallback={
                            <span class="truncate font-sans text-sm">
                              {map.title || "Untitled"}
                            </span>
                          }
                        >
                          <input
                            type="text"
                            value={map.title || ""}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => handleRename(map, e.target.value)}
                            onKeyDown={(e) =>
                              e.key === "Enter" && e.currentTarget.blur()
                            }
                            class="min-w-0 flex-1 rounded border border-pane-hover
              bg-bg px-2 py-1 text-sm"
                          />
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>

      <ConfirmDialog
        open={!!pendingDeleteId()}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        title="Delete this map?"
        description="This cannot be undone."
        onConfirm={confirmDelete}
      />
    </div>
  );
}
