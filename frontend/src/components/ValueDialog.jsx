import { createEffect, createSignal } from "solid-js";
import { Dialog } from "@kobalte/core/dialog";
import {
  currentItem,
  valueDialogOpen,
  closeValueDialog,
} from "../lib/mindmap/store";

// Replaces command/edit.js's old prompt()-based "Set value" flow with a
// Kobalte dialog, mirroring ConfirmDialog.jsx's structure. Always
// mounted (see MindMapCanvas.jsx); visibility is store.js's
// valueDialogOpen signal, opened by the "value" command.
export default function ValueDialog() {
  let inputRef;
  const [value, setValue] = createSignal("");

  // Dynamically imported on first confirm, like RightPanel.jsx does for
  // the same modules -- avoids pulling the engine bundle in before the
  // canvas actually mounts.
  let actionsModule;
  let appModule;

  // Pre-fills the input with the current item's value whenever the
  // dialog opens, mirroring window.prompt()'s default-text behavior.
  createEffect(() => {
    if (!valueDialogOpen()) {
      return;
    }
    const item = currentItem();
    setValue(item?.value == null ? "" : String(item.value));
    queueMicrotask(() => {
      inputRef?.focus();
      inputRef?.select();
    });
  });

  async function handleConfirm() {
    const item = currentItem();
    if (!item) {
      closeValueDialog();
      return;
    }
    if (!actionsModule || !appModule) {
      [actionsModule, appModule] = await Promise.all([
        import("../lib/mindmap/action.js"),
        import("../lib/mindmap/my-mind.js"),
      ]);
    }
    // Same conversion as the old prompt()-based flow: an empty input
    // becomes null, then Number(...) decides whether the stored value is
    // numeric or left as a string (e.g. a formula id).
    let newValue = value();
    if (!newValue.length) {
      newValue = null;
    }
    const numValue = Number(newValue);
    appModule.action(
      new actionsModule.SetValue(item, isNaN(numValue) ? newValue : numValue),
    );
    closeValueDialog();
  }

  return (
    <Dialog
      open={valueDialogOpen()}
      onOpenChange={(open) => !open && closeValueDialog()}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
        <div class="fixed inset-0 z-40 flex items-center justify-center p-4">
          <Dialog.Content class="w-full max-w-sm rounded-md border border-pane-hover bg-pane p-5 shadow-card">
            <Dialog.Title class="text-lg font-semibold text-text">
              Set item value
            </Dialog.Title>
            <Dialog.Description class="mt-2 text-sm text-text/70">
              Enter a number, a formula id, or leave blank to clear.
            </Dialog.Description>
            <input
              ref={inputRef}
              type="text"
              value={value()}
              onInput={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
              class="mt-3 w-full rounded-md border border-pane-hover bg-bg px-3 py-2 text-text outline-none focus:border-accent"
            />
            <div class="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeValueDialog}
                class="rounded-md px-3 py-1.5 text-sm text-text hover:bg-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                class="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
              >
                Set
              </button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
}
