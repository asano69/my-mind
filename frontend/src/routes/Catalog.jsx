import { createResource, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";

import pb from "../lib/pb";
import {
  updateTitle,
  updatePin,
  deleteMap,
} from "../lib/mindmap/backend/pocketbase";
import Search from "../components/Search";


// query is empty for the initial/unfiltered list, or a title search term.
// pb.filter() escapes the value for us; "~" is PocketBase's substring
// match operator. Pinned maps ("-pin") always sort before unpinned ones,
// then newest-updated first.
async function fetchMaps(query) {
  // svg is stored directly on the record, so no extra request is needed
  // to render a thumbnail.
  return pb.collection("maps").getFullList({
    sort: "-pin,-updated",
    fields: "id,uuid,title,svg,pin",
    filter: query ? pb.filter("title ~ {:q}", { q: query }) : "",
  });
}

export default function Catalog() {
  const [query, setQuery] = createSignal("");
  // Re-fetches from PocketBase whenever query() changes.
  const [maps, { mutate }] = createResource(query, fetchMaps);
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
          <h1 class="font-serif text-3xl">my-mind</h1>
          <div class="flex gap-2">
            <button
              onClick={() => setEditMode(!editMode())}
              class="rounded-md border border-pane-hover bg-pane px-4 py-2 text-sm hover:bg-pane-hover"
            >
              {editMode() ? "Done" : "Edit"}
            </button>
            <A
              href="/"
              class="rounded-md border border-pane-hover bg-pane px-4 py-2 text-sm hover:bg-pane-hover"
            >
              New
            </A>
          </div>
        </div>
        <div class="mb-6">
          <Search onSearch={setQuery} />
        </div>

        <Show when={!maps.loading} fallback={<p>Loading…</p>}>
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
            <div class="flex flex-col overflow-hidden rounded-md border border-pane-hover bg-pane text-left shadow-card transition hover:bg-pane-hover">
              <div class="relative flex h-32 items-center justify-center overflow-hidden bg-white/50">
                {/* SVG only — innerHTML replaces this element's children on
                    every render, so nothing else may live inside it. Pin
                    badge/buttons are rendered as siblings below instead. */}
                <A
                  href={`/maps/${map.uuid}`}
                  onClick={(e) => editMode() && e.preventDefault()}
                  class="h-full w-full p-2 [&_svg]:!static [&_svg]:!h-full
        [&_svg]:!w-full [&_svg]:!overflow-hidden"
                  classList={{ "cursor-pointer": !editMode() }}
                  innerHTML={map.svg || ""}
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
