import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { currentMapId, snapshotsListVersion } from "../lib/mindmap/store";
import { listSnapshots, getSnapshot } from "../lib/mindmap/backend/pocketbase";
import Spinner from "./Spinner";
import ConfirmDialog from "./ConfirmDialog";

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString();
}

// Vertical list of a map's restorable past snapshots, shown inside
// LeftPanel.jsx once the "recover" command is triggered (see
// command/command.js). Mirrors Catalog.jsx's map grid, but as a single
// column since it lives inside the narrow left sidebar.
export default function SnapshotsList() {
  // Refetches whenever the open map changes OR snapshotsListVersion is
  // bumped (see LeftPanel.jsx's clickable "Snapshots" pane title).
  // createResource only refetches when the *source value itself* changes
  // (a strict-inequality check) -- returning currentMapId() unchanged
  // here would make a version-only bump a no-op, since re-clicking while
  // the same map's snapshots are already showing never changes the map
  // id. Returning a tuple of both values instead guarantees a fresh
  // array reference (and thus a detected change) on every version bump,
  // even when the map id hasn't moved.
  const resourceSource = createMemo(() => [currentMapId(), snapshotsListVersion()]);
  const [snapshots] = createResource(resourceSource, ([mapId]) => listSnapshots(mapId));
  // The snapshot awaiting restore confirmation, or null. Mirrors
  // Catalog.jsx's pendingDeleteId pattern -- confirmation itself is
  // handled by ConfirmDialog (see render below) instead of a native
  // confirm() popup.
  const [pendingSnapshot, setPendingSnapshot] = createSignal(null);

  async function confirmRestore() {
    const snapshot = pendingSnapshot();
    if (!snapshot) {
      return;
    }
    const full = await getSnapshot(snapshot.id);
    const io = await import("../lib/mindmap/ui/io.js");
    // Turn auto-save off before swapping in the snapshot's content, so
    // the server's current copy is not silently overwritten. This keeps
    // an escape hatch: if the restored snapshot turns out to be the
    // wrong choice, leaving without saving (or reloading) still recovers
    // whatever was last saved to the server, rather than that state
    // being lost the moment auto-save's debounce fires.
    await io.setAutoSave(false);
    io.restoreSnapshot(full);
  }

  return (
    <>
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
                    onClick={() => setPendingSnapshot(snapshot)}
                    class="flex flex-col overflow-hidden rounded-md border
                      border-pane-hover bg-pane text-left shadow-card
                      transition hover:bg-pane-hover"
                  >
                    {/* Server-rendered image (see backend/pocketbase.js's
                        listSnapshots() comment) instead of innerHTML, so
                        this SVG's embedded <style> can't leak into the
                        page. */}
                    <div class="flex h-20 items-center justify-center overflow-hidden bg-white/50 p-1">
                      <img
                        src={`/snapshots/${snapshot.id}/svg`}
                        alt=""
                        class="pointer-events-none h-full w-full select-none object-contain"
                      />
                    </div>
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

      <ConfirmDialog
        open={!!pendingSnapshot()}
        onOpenChange={(open) => !open && setPendingSnapshot(null)}
        title="Restore this snapshot?"
        description="This replaces the current map's entire content with this snapshot. Auto-save will be disabled for safety."
        confirmLabel="Restore"
        onConfirm={confirmRestore}
      />
    </>
  );
}
