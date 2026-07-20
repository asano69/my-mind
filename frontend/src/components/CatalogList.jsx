import { For, Show, createResource } from "solid-js";
import { listMaps } from "../lib/mindmap/backend/pocketbase";
import { A, useNavigate } from "@solidjs/router";
// Read-only list of every saved map, shown inline in the left sidebar
// (see LeftPanel.jsx's "catalog-list" command) instead of navigating away
// to the full /catalog page. Sorted pinned-first, then by most recently
// updated (see backend/pocketbase.js's listMaps()). Mirrors
// SnapshotsList.jsx's layout, but for maps instead of snapshots, and with
// no edit affordances (renaming/pinning/deleting stay on /catalog).
export default function CatalogList() {
  const navigate = useNavigate();
  const [maps] = createResource(() => listMaps());

  // Persist the current map first (mirrors LeftPanel.jsx's own
  // goToCatalog handler), then navigate via the router. Workspace.jsx
  // keys MindMapCanvas on the route's uuid, so this client-side
  // navigation still gets a clean engine unmount()/mount() cycle for
  // the newly opened map -- a full page reload is no longer needed.
  async function handleOpen(uuid) {
    console.log("[CatalogList] handleOpen called, uuid =", uuid);
    const io = await import("../lib/mindmap/ui/io.js");
    try {
      await io.saveWithSvg();
      console.log("[CatalogList] saveWithSvg resolved");
    } catch (e) {
      console.log("[CatalogList] saveWithSvg threw", e);
    }
    console.log("[CatalogList] calling navigate to", `/maps/${uuid}`);
    navigate(`/maps/${uuid}`);
    console.log("[CatalogList] navigate() call returned");
  }

  return (
    <Show
      when={!maps.loading}
      fallback={<p class="px-1 text-sm text-text/50">Loading…</p>}
    >
      <Show
        when={maps()?.length}
        fallback={<p class="px-1 text-sm text-text/50">No maps yet.</p>}
      >
        <div class="flex flex-col gap-2">
          <A href="/catalog" title="Catalog">
            <h2> My mind </h2>
          </A>

          <For each={maps()}>
            {(map) => (
              <button
                onClick={() => handleOpen(map.uuid)}
                class="flex flex-col overflow-hidden rounded-md border
                  border-pane-hover bg-pane text-left shadow-card
                  transition hover:bg-pane-hover"
              >
                <div class="relative flex h-20 items-center justify-center overflow-hidden bg-white/50">
                  <div
                    class="h-full w-full p-1 [&_svg]:!static [&_svg]:!h-full
                      [&_svg]:!w-full [&_svg]:pointer-events-none [&_svg]:select-none"
                    innerHTML={map.svg || ""}
                  />
                  <Show when={map.pin}>
                    <span class="absolute top-1 right-1 text-sm drop-shadow">
                      📍
                    </span>
                  </Show>
                </div>
                <div class="px-2 py-1 text-xs">
                  <div class="truncate">{map.title || "Untitled"}</div>
                </div>
              </button>
            )}
          </For>
        </div>
      </Show>
    </Show>
  );
}
