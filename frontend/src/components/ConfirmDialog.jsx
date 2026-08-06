import { Show } from "solid-js";
import { Dialog } from "@kobalte/core/dialog";

// Reusable destructive-action confirmation dialog, replacing the
// browser-native confirm() popup (see TopBar.jsx/Catalog.jsx's delete
// buttons). Fully controlled: the caller owns `open` and decides what
// happens on confirm/cancel, mirroring SelectField.jsx's use of Kobalte.
export default function ConfirmDialog(props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
        <div class="fixed inset-0 z-40 flex items-center justify-center p-4">
          <Dialog.Content class="w-full max-w-sm rounded-md border border-pane-hover bg-pane p-5 shadow-card">
            <Dialog.Title class="text-lg font-semibold text-text">
              {props.title}
            </Dialog.Title>
            <Show when={props.description}>
              <Dialog.Description class="mt-2 text-sm text-text/70">
                {props.description}
              </Dialog.Description>
            </Show>
            <div class="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => props.onOpenChange(false)}
                class="rounded-md px-3 py-1.5 text-sm text-text hover:bg-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  // Call onConfirm() before onOpenChange(false): callers
                  // (e.g. Catalog.jsx's confirmDelete) may read state that
                  // onOpenChange's handler clears (pendingDeleteId), so
                  // confirming first ensures that state is still valid.
                  props.onConfirm();
                  props.onOpenChange(false);
                }}
                class="rounded-md bg-[#dc3545] px-3 py-1.5 text-sm text-white hover:opacity-90"
              >
                {props.confirmLabel ?? "Delete"}
              </button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
}
