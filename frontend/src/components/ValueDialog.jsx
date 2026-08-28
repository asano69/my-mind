import { createEffect, createSignal, Show } from "solid-js";
import { Dialog } from "@kobalte/core/dialog";
import { valueDialogOpen, closeValueDialog } from "../lib/mindmap/store";
import { useScopeWhen } from "mindmap-engine";
import { currentItem } from "../lib/mindmap/engineInstance.js";

// Replaces command/edit.js's old prompt()-based "Set value" flow with a
// Kobalte dialog, mirroring ConfirmDialog.jsx's structure. Always
// mounted (see MindMapCanvas.jsx); visibility is store.js's
// valueDialogOpen signal, opened by the "value" command.
// Empty input is intentionally NOT invalid -- it means "clear the
// value" (see handleConfirm below). Anything else must parse as a
// number, or SetValue would silently store an arbitrary string that
// item.js's resolvedValue getter can't interpret (it falls through to
// 0 for any value it doesn't recognize as sum/avg/min/max), which is
// confusing since nothing signals that the save was rejected.
function isInvalidInput(text) {
  return text.length > 0 && isNaN(Number(text));
}

export default function ValueDialog() {
  let inputRef;
  const [value, setValue] = createSignal("");

  // See ConfirmDialog.jsx's own comment on why this is needed.
  useScopeWhen(valueDialogOpen, "dialog");

  // Dynamically imported on first confirm, like RightPanelProperties.jsx
  // does for the same modules -- avoids pulling the engine bundle in
  // before the canvas actually mounts. SetValueClass is the action
  // class; dispatchAction pushes it onto history and runs it.
  let SetValueClass;
  let dispatchAction;

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
    const raw = value();
    if (isInvalidInput(raw)) {
      // Block the save; the Set button is disabled and Enter is a
      // no-op for the same reason, so this mainly guards against a
      // stale keydown racing a fresh value() update.
      return;
    }
    if (!dispatchAction) {
      const [{ SetValue }, { action }] = await Promise.all([
        import("mindmap-engine"),
        import("../lib/mindmap/engineInstance.js"),
      ]);
      SetValueClass = SetValue;
      dispatchAction = action;
    }
    // Empty input clears the value; otherwise it's always a real
    // number now that isInvalidInput() rejects anything else.
    const newValue = raw.length ? Number(raw) : null;
    dispatchAction(new SetValueClass(item, newValue));
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
              onKeyDown={(e) =>
                e.key === "Enter" && !isInvalidInput(value()) && handleConfirm()
              }
              aria-invalid={isInvalidInput(value())}
              class="mt-3 w-full rounded-md border bg-bg px-3 py-2 text-text outline-none focus:border-accent"
              classList={{
                "border-pane-hover": !isInvalidInput(value()),
                "border-[#cc0000]": isInvalidInput(value()),
              }}
            />
            <Show when={isInvalidInput(value())}>
              <p class="mt-1 text-sm text-[#cc0000]">
                Enter a number, or leave blank to clear.
              </p>
            </Show>
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
                disabled={isInvalidInput(value())}
                class="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
