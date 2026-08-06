import { createResource, createSignal, For, Show } from "solid-js";

import { A, useNavigate } from "@solidjs/router";
//import Logo from "../components/Logo";
import Search from "../components/Search";
import Spinner from "../components/Spinner";
import IconButton, { iconButtonClass } from "../components/IconButton";
import FilePlus from "lucide-solid/icons/file-plus";
import Settings2 from "lucide-solid/icons/settings-2";
import Check from "lucide-solid/icons/check";
import Logo from "../components/Logo";

import {
  listMaps,
  updateTitle,
  updatePin,
  deleteMap,
} from "../lib/mindmap/backend/pocketbase";

export default function Catalog() {
  const navigate = useNavigate();
  const [query, setQuery] = createSignal("");
  // Re-fetches from PocketBase whenever query() changes.
  const [maps, { mutate }] = createResource(query, listMaps);
  const [editMode, setEditMode] = createSignal(false);

  async function handleDelete(id) {
    if (!confirm("Delete this map?")) return;
    await deleteMap(id);
    mutate((prev) => prev.filter((m) => m.id !== id));
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
  }

  return (
    <div class="min-h-screen bg-bg p-8 text-text">
      <div class="mx-auto max-w-5xl">
        <div class="mb-6 flex items-center justify-between">
  <Logo showTitle/>
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
          fallback={<Spinner visible={true} class="relative mx-auto h-10 w-10" />}
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
                      <div class="relative flex h-32 items-center justify-center overflow-hidden bg-white/50">
                        {/* Server-rendered image (see
                            backend/pocketbase.js's listMaps() comment)
                            instead of innerHTML, so this SVG's embedded
                            <style> can't leak into the page. */}
                        <img
                          src={`/maps/${map.uuid}/svg`}
                          alt=""
                          class="pointer-events-none h-full w-full select-none object-contain p-2"
                        />

                        <Show when={!editMode() && map.pin}>
                          <span class="absolute top-1 right-1 text-sm drop-shadow">
                            📍
                          </span>
                        </Show>
                        <Show when={editMode()}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTogglePin(map);
                            }}
                            title={map.pin ? "Unpin" : "Pin"}
                            class="absolute top-1 right-1 flex h-7 w-7 items-center justify-center text-sm"
                            classList={{ "opacity-30": !map.pin }}
                          >
                            📍
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(map.id);
                            }}
                            title="Delete"
                            class="absolute top-1 left-1 flex h-7 w-7 items-center justify-center text-sm"
                          >
                            🗑️
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
    </div>
  );
}
