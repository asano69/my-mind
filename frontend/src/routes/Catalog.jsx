import { createResource, For, Show } from "solid-js";

import pb from "../lib/pb";

async function fetchMaps() {
  // svg is stored directly on the record, so no extra request is needed
  // to render a thumbnail.
  return pb.collection("maps").getFullList({
    sort: "-updated",
    fields: "id,uuid,title,svg",
  });
}

export default function Catalog() {
  const [maps] = createResource(fetchMaps);


  return (
    <div class="min-h-screen bg-bg p-8 text-text">
      <div class="mx-auto max-w-5xl">
        <div class="mb-6 flex items-center justify-between">
          <h1 class="font-serif text-3xl">my-mind</h1>
          <button
             onClick={() => (window.location.href = "/")}
            class="rounded-md border border-pane-hover bg-pane px-4 py-2 text-sm hover:bg-pane-hover"
          >
            New map
          </button>
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
                    <button
                         onClick={() => (window.location.href = `/maps/${map.uuid}`)}
                      class="flex flex-col overflow-hidden rounded-md border
                        border-pane-hover bg-pane text-left shadow-card
                        transition hover:bg-pane-hover"
                    >
                      <div
                        class="flex h-32 items-center justify-center overflow-hidden
                           bg-white p-2 [&_svg]:!static [&_svg]:!h-full
                          [&_svg]:!w-full [&_svg]:!overflow-hidden"
                        innerHTML={map.svg || ""}
                      />
                      <div class="truncate px-3 py-2 font-sans text-sm">
                        {map.title || "Untitled"}
                      </div>
                    </button>
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
