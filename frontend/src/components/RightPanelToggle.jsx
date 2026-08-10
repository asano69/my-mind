import { Show } from "solid-js";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import { rightPanelHidden, toggleRightPanel } from "../lib/mindmap/store";

// Tab handle for toggling the right property panel. Lives outside #ui
// (see RightPanel.jsx) so it stays visible even when the panel
// collapses to zero width. Tracks the panel's left edge via the same
// `right` offset/duration as #ui's own width transition, so it slides
// together with the panel instead of jumping at the end of the
// animation.
export default function RightPanelToggle() {
  return (
    <button
      class="fixed top-1/2 z-4 flex h-14 w-5 -translate-y-1/2 items-center
        justify-center rounded-l-lg bg-pane text-accent shadow-card
        transition-[right] duration-300 ease-in-out hover:bg-pane-hover"
      style={{
        right: rightPanelHidden() ? "0px" : "var(--right-panel-width)",
      }}
      onClick={toggleRightPanel}
      title="Toggle sidebar"
    >
      <Show when={rightPanelHidden()} fallback={<ChevronRight size={16} />}>
        <ChevronLeft size={16} />
      </Show>
    </button>
  );
}
