import { For, Show, createResource } from "solid-js";
import { currentMapId } from "../lib/mindmap/store";
import { listSnapshots, getSnapshot } from "../lib/mindmap/backend/pocketbase";
import Spinner from "./Spinner";

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString();
}

// Vertical list of a map's restorable past snapshots, shown inside
// LeftPanel.jsx once the "recover" command is triggered (see
// command/command.js). Mirrors Catalog.jsx's map grid, but as a single
// column since it lives inside the narrow left sidebar.
export default function SnapshotsList() {
  const [snapshots] = createResource(currentMapId, listSnapshots);

  async function handleRestore(snapshot) {
    if (!confirm("Restore this snapshot? Unsaved changes will be lost.")) {
      return;
    }
    const full = await getSnapshot(snapshot.id);
    const io = await import("../lib/mindmap/ui/io.js");
    io.restoreSnapshot(full);
  }

  return (
    <Show
      when={currentMapId()}
      fallback={<p class="px-1 text-sm text-text/50">Open a map first.</p>}
    >
      <Show
        when={!snapshots.loading}
        fallback={<Spinner visible={true} class="relative mx-auto h-6 w-6" />}
      >
        <Show
          when={snapshots()?.length}
          fallback={<p class="px-1 text-sm text-text/50">No snapshots yet.</p>}
        >
          <div class="flex flex-col gap-2">
            <For each={snapshots()}>
              {(snapshot) => (
                <button
                  onClick={() => handleRestore(snapshot)}
                  class="flex flex-col overflow-hidden rounded-md border
                    border-pane-hover bg-pane text-left shadow-card
                    transition hover:bg-pane-hover"
                >
                  <div
                    class="flex h-20 items-center justify-center overflow-hidden
                      bg-white/50 p-1 [&_svg]:!static [&_svg]:!h-full
                      [&_svg]:!w-full [&_svg]:pointer-events-none [&_svg]:select-none"
                    innerHTML={snapshot.svg || ""}
                  />
                  <div class="px-2 py-1 text-xs">
                    <div class="truncate">{formatDate(snapshot.created)}</div>
                    <div class="text-text/50">{snapshot.tier}</div>
                  </div>
                </button>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </Show>
  );
}
