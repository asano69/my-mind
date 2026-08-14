import { createMemo, createSignal, onMount } from "solid-js";
import { Switch } from "@kobalte/core/switch";
import { autoSaveEnabled, saveStatus } from "../lib/mindmap/store";

// Colors for the save-status dot (see saveStatusStyle below): green
// while the server copy matches what's on screen, yellow while local
// edits haven't been confirmed saved yet, red if the last save attempt
// failed (e.g. the connection to the server was lost).
const SAVE_STATUS_STYLES = {
  saved: { class: "bg-[#2ca02c]", label: "Saved" },
  dirty: { class: "bg-[#C68E17]", label: "Unsaved changes" },
  error: { class: "bg-[#cc0000]", label: "Save failed" },
};

// The panel's footer: the auto-save on/off switch and the save-status
// dot. Split out of RightPanel.jsx as its own self-contained concern.
export default function RightPanelFooter() {
  let ioModule; // cached after the first dynamic import, see onMount
  const [ready, setReady] = createSignal(false);

  onMount(async () => {
    ioModule = await import("../lib/mindmap/ui/io.js");
    setReady(true);
  });

  const saveStatusStyle = createMemo(
    () => SAVE_STATUS_STYLES[saveStatus()] ?? SAVE_STATUS_STYLES.saved,
  );

  // Persists the auto-save on/off preference via ui/io.js's
  // setAutoSave(), which both updates store.js's signal and writes it to
  // PocketBase's settings collection.
  function handleAutoSaveChange(checked) {
    ioModule?.setAutoSave(checked);
  }

  return (
    <footer class="flex min-h-[28px] flex-none items-center justify-between border-t border-black/10 px-3 py-1.5">
      <Switch
        checked={autoSaveEnabled()}
        onChange={handleAutoSaveChange}
        disabled={!ready()}
        class="flex items-center gap-1.5"
      >
        <Switch.Input />
        <Switch.Control class="relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full bg-pane-hover transition-colors data-[checked]:bg-brand">
          <Switch.Thumb class="block h-3 w-3 translate-x-0.5 rounded-full bg-white transition-transform data-[checked]:translate-x-[14px]" />
        </Switch.Control>
        <Switch.Label class="cursor-pointer text-xs text-text/70 select-none">
          Auto-save
        </Switch.Label>
      </Switch>
      <span
        class={`h-2.5 w-2.5 rounded-full ${saveStatusStyle().class}`}
        title={saveStatusStyle().label}
      />
    </footer>
  );
}
