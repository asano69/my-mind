import { Dialog } from "@kobalte/core/dialog";
import { errorDialogMessage, closeErrorDialog } from "../lib/mindmap/store";

// Replaces the native window.alert() previously used by io.js's error()
// handler with a Kobalte dialog matching the rest of the app's UI (see
// ConfirmDialog.jsx/ValueDialog.jsx for the same pattern: a plain vanilla
// module writes to a store.js signal, and this always-mounted component
// renders whenever that signal is set). Always mounted (see
// MindMapCanvas.jsx); visibility is store.js's errorDialogMessage signal.
export default function ErrorDialog() {
  return (
    <Dialog
      open={!!errorDialogMessage()}
      onOpenChange={(open) => !open && closeErrorDialog()}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
        <div class="fixed inset-0 z-40 flex items-center justify-center p-4">
          <Dialog.Content class="w-full max-w-sm rounded-md border border-pane-hover bg-pane p-5 shadow-card">
            <Dialog.Title class="text-lg font-semibold text-text">
              Error
            </Dialog.Title>
            <Dialog.Description class="mt-2 text-sm break-words text-text/70">
              {errorDialogMessage()}
            </Dialog.Description>
            <div class="mt-5 flex justify-end">
              <button
                type="button"
                onClick={closeErrorDialog}
                class="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
              >
                OK
              </button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
}
