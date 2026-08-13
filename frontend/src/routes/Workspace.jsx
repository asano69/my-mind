import { useNavigate, useParams } from "@solidjs/router";
import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";
import {
  activeMode,
  canvasReloadVersion,
  leftPanelHidden,
  setLeftPanelHidden,
  rightPanelHidden,
  setRightPanelHidden,
} from "../lib/mindmap/store";
import { getSetting, setSetting } from "../lib/mindmap/backend/pocketbase";
import NotesEditor from "../components/NotesEditor";
import MindMapCanvas from "../components/MindMapCanvas";
import TopBar from "../components/TopBar";
import LeftPanel from "../components/LeftPanel";

// Persisted in PocketBase's "settings" collection — the same key/value
// table ui/io.js's auto-save toggle already uses — so the left/right
// panels' open/closed state survives reloads.
const LEFT_PANEL_SETTING_KEY = "leftPanelHidden";
const RIGHT_PANEL_SETTING_KEY = "rightPanelHidden";

export default function Workspace() {
  const params = useParams();
  const navigate = useNavigate();

  // Registers this route's navigate() with the shared navigation.js
  // bridge (see that module's own comment) so same-origin link clicks --
  // the 🔗 icon rendered by both engines (item.js's click handler for
  // the old engine, newMouse.js's handleItemLinkClick for the new one)
  // -- can use Solid Router's client-side navigation instead of a full
  // page reload.
  onMount(async () => {
    const { registerNavigate } = await import("../lib/mindmap/navigation.js");
    registerNavigate(navigate);
  });

  // "/maps/new" is not a real map id — treat it the same as no uuid at
  // all, so MindMapCanvas/io.restore() create a fresh, unsaved map
  // instead of trying to look up a map literally named "new".
  const uuid = () => (params.uuid === "new" ? undefined : params.uuid);

  // Combines the route's uuid with a bump-only "reload" signal, so the
  // logo's reload action (see RightPanel.jsx) can force MindMapCanvas to
  // remount without touching the URL -- <Show keyed> remounts its child
  // whenever the value passed to `when` changes.
  const canvasKey = createMemo(
    () => `${params.uuid ?? "__new__"}:${canvasReloadVersion()}`,
  );

  // Loads the persisted panel visibility once on mount, then starts
  // writing back any subsequent toggle. settingsLoaded guards the two
  // write-back effects below so the initial load itself doesn't
  // immediately re-save the value it just read.
  const [settingsLoaded, setSettingsLoaded] = createSignal(false);

  onMount(async () => {
    const [left, right] = await Promise.all([
      getSetting(LEFT_PANEL_SETTING_KEY),
      getSetting(RIGHT_PANEL_SETTING_KEY),
    ]);
    if (left !== null) {
      setLeftPanelHidden(left === "true");
    }
    if (right !== null) {
      setRightPanelHidden(right === "true");
    }
    setSettingsLoaded(true);
  });

  createEffect(() => {
    if (!settingsLoaded()) {
      return;
    }
    setSetting(LEFT_PANEL_SETTING_KEY, String(leftPanelHidden()));
  });

  createEffect(() => {
    if (!settingsLoaded()) {
      return;
    }
    setSetting(RIGHT_PANEL_SETTING_KEY, String(rightPanelHidden()));
  });

  createEffect(() => {
    console.log("[Workspace] params.uuid changed to", params.uuid);
  });

  return (
    <>
      <div
        class="fixed inset-0"
        classList={{ "pointer-events-none": activeMode() !== "canvas" }}
        style={{ "z-index": activeMode() === "canvas" ? 1 : 0 }}
      >
        <Show when={canvasKey()} keyed>
          {(key) => {
            console.log("[Workspace] Show children re-created, key =", key);
            return <MindMapCanvas uuid={uuid()} />;
          }}
        </Show>
      </div>

      <div
        class="fixed inset-0 transition-[margin-left] duration-300 ease-in-out"
        classList={{ "pointer-events-none": activeMode() !== "notes" }}
        style={{
          "z-index": activeMode() === "notes" ? 1 : 0,
          "margin-left": leftPanelHidden()
            ? "var(--ribbon-width)"
            : "var(--side-panel-width)",
        }}
      >
        <NotesEditor />
      </div>

      <TopBar />
      <LeftPanel />
    </>
  );
}
