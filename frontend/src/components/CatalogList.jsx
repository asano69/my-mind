import { For, Show, createResource } from "solid-js";
import { listMaps } from "../lib/mindmap/backend/pocketbase";
import { A, useNavigate } from "@solidjs/router";
import { catalogListVersion } from "../lib/mindmap/store";
import Spinner from "./Spinner";
import Pin from "lucide-solid/icons/pin";

// Read-only list of every saved map, shown inline in the left sidebar
// (see LeftPanel.jsx's "catalog-list" command) instead of navigating away
// to the full /catalog page. Sorted pinned-first, then by most recently
// updated (see backend/pocketbase.js's listMaps()). Mirrors
// SnapshotsList.jsx's layout, but for maps instead of snapshots, and with
// no edit affordances (renaming/pinning/deleting stay on /catalog).
export default function CatalogList() {
  const navigate = useNavigate();
  // catalogListVersion as the resource's source: its value is ignored by
  // listMaps() (called with no args), but any bump re-triggers the fetch
  // -- see store.js's openCatalogList() for why a plain mount-only
  // fetch isn't enough here.
  const [maps] = createResource(catalogListVersion, () => listMaps());

  // Persist the current map first (mirrors LeftPanel.jsx's own
  // goToCatalog handler), then navigate via the router. Workspace.jsx
  // keys MindMapCanvas on the route's uuid, so this client-side
  // navigation still gets a clean engine unmount()/mount() cycle for
  // the newly opened map -- a full page reload is no longer needed.
  async function handleOpen(uuid) {
    console.log("[CatalogList] handleOpen called, uuid =", uuid);
    const io = await import("../lib/mindmap/ui/io.js");
    try {
      await io.saveBeforeLeaving();
      console.log("[CatalogList] saveBeforeLeaving resolved");
    } catch (e) {
      console.log("[CatalogList] saveBeforeLeaving threw", e);
    }
    console.log("[CatalogList] calling navigate to", `/maps/${uuid}`);
    navigate(`/maps/${uuid}`);
    console.log("[CatalogList] navigate() call returned");
  }

  return (
    <Show
      when={!maps.loading}
      fallback={<Spinner visible={true} class="relative mx-auto h-6 w-6" />}
    >
      <Show
        when={maps()?.length}
        fallback={<p class="px-1 text-sm text-text/50">No maps yet.</p>}
      >
        <div class="flex flex-col gap-2">
          <For each={maps()}>
            {(map) => (
              <button
                onClick={() => handleOpen(map.uuid)}
                class="flex flex-col overflow-hidden rounded-md border
                  border-pane-hover bg-pane text-left shadow-card
                  transition hover:bg-pane-hover"
              >
                <div class="relative flex h-20 items-center justify-center overflow-hidden bg-white/50">
                  {/* Server-rendered image (see backend/pocketbase.js's
                      listMaps() comment) instead of innerHTML, so this
                      SVG's embedded <style> can't leak into the page.
                      "updated" is a cache-busting query param, same as
                      Catalog.jsx -- the URL itself never changes when a
                      map is edited, so without this the browser can keep
                      showing a stale cached SVG even after a fresh
                      fetch. */}
                  <img
                    src={`/maps/${map.uuid}/svg?t=${encodeURIComponent(map.updated)}`}
                    alt=""
                    class="pointer-events-none h-full w-full select-none object-contain p-1"
                  />
                  {/* style.css's global `svg { position: absolute }` rule
                      (see Logo.jsx) would otherwise apply here too. */}
                  <Show when={map.pin}>
                    <span class="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/70 text-[#2ca02c] drop-shadow">
                      <Pin size={14} style={{ position: "static" }} />
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
