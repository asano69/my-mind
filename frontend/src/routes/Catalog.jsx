import { createResource, createSignal, For, Show } from "solid-js";

import pb from "../lib/pb";
import { updateTitle, deleteMap } from "../lib/mindmap/backend/pocketbase";

async function fetchMaps() {
  // svg is stored directly on the record, so no extra request is needed
  // to render a thumbnail.
  return pb.collection("maps").getFullList({
    sort: "-updated",
    fields: "id,uuid,title,svg",
  });
}

export default function Catalog() {
  const [maps, { mutate }] = createResource(fetchMaps);
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
      <button
              onClick={() => (window.location.href = "/")}
              class="rounded-md border border-pane-hover bg-pane px-4 py-2 text-sm hover:bg-pane-hover"
            >
              New 
    </button>
          </div>
        </div>

        <Show when={!maps.loading} fallback={<p>Loading…</p>}>
          <Show when={!maps.error} fallback={<p>Failed to load maps.</p>}>
            <Show
              when={maps()?.length}
              fallback={<p class="text-text/50">No maps yet.</p>}
            >
              <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                <For each={maps()}>
                  {(map) => (
                    <div
                      class="flex flex-col overflow-hidden rounded-md border
                        border-pane-hover bg-pane text-left shadow-card
                        transition hover:bg-pane-hover"
                    >
                      <div
                        onClick={() =>
                          !editMode() &&
                          (window.location.href = `/maps/${map.uuid}`)
                        }
                        class="flex h-32 items-center justify-center overflow-hidden
                           bg-white p-2 [&_svg]:!static [&_svg]:!h-full
                          [&_svg]:!w-full [&_svg]:!overflow-hidden"
                        classList={{ "cursor-pointer": !editMode() }}
                        innerHTML={map.svg || ""}
                      />
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
                          <button
                            onClick={() => handleDelete(map.id)}
                            title="Delete"
                            class="shrink-0 rounded px-2 py-1 text-sm text-[#dc3545]
                              hover:bg-pane-hover"
                          >
                            🗑️
                          </button>
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
