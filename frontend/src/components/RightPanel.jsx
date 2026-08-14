import { rightPanelHidden, reloadCanvas } from "../lib/mindmap/store";
import Spinner from "./Spinner";
import Logo from "./Logo";
import RightPanelExportActions from "./RightPanelExportActions";
import RightPanelProperties from "./RightPanelProperties";
import RightPanelFooter from "./RightPanelFooter";
import RightPanelToggle from "./RightPanelToggle";

// The property panel (#ui) — per-item fields, image/link export actions,
// and the save-status footer for the currently open map. Structured as
// a ribbon-or-expanded sidebar, mirroring LeftPanel.jsx: it animates its
// own width between 0 and var(--right-panel-width) instead of the old
// `.pane` slide-off-screen behavior.
//
// Split into RightPanelExportActions/RightPanelProperties/
// RightPanelFooter/RightPanelToggle, each owning its own lazy imports
// and local state, so this file is left as pure composition/layout.
//
// Visibility is store.js's `rightPanelHidden` signal, read/written
// directly — no bridge object needed (see CLAUDE.md's Phase 5 addendum,
// "read-only consumption — no bridge object"), same as LeftPanel.jsx's
// `leftPanelHidden`.
export default function RightPanel() {
  return (
    <>
      <div
        id="ui"
        class="fixed inset-y-0 right-0 z-5 flex overflow-hidden bg-pane shadow-card transition-[width] duration-300 ease-in-out"
        style={{
          width: rightPanelHidden() ? "0px" : "var(--right-panel-width)",
        }}
      >
        <div
          class="flex min-h-0 min-w-0 flex-1 flex-col transition-opacity duration-200"
          classList={{
            "opacity-0": rightPanelHidden(),
            "pointer-events-none": rightPanelHidden(),
          }}
        >
          <div class="flex-1 overflow-y-auto">
            <div class="flex justify-center p-1 border-b border-black/10">
              {/* Clicking the logo used to navigate to the catalog
                  (linkable). It now force-remounts the current map
                  instead -- a lightweight full-reload, for when the
                  map's client-side state gets into a broken state (see
                  store.js's reloadCanvas()). */}
              <Logo
                size={28}
                showTitle
                centerTitle
                onClick={reloadCanvas}
                title="Reload map"
              />
            </div>

            <RightPanelExportActions />
            <RightPanelProperties />
          </div>

          <RightPanelFooter />
        </div>

        <Spinner />
      </div>

      <RightPanelToggle />
    </>
  );
}
