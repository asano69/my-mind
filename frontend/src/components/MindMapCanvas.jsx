// frontend/src/components/MindMapCanvas.jsx
import RightPanel from "./RightPanel";
import ValueDialog from "./ValueDialog";
import FileSwitcher from "./FileSwitcher";

import ContextMenuContent from "./ContextMenu";
import { ContextMenu } from "@kobalte/core/context-menu";
import { onMount, onCleanup } from "solid-js";
import { activeMode } from "../lib/mindmap/store";

export default function MindMapCanvas(props) {
  let mainRef;
  // Wraps every element this route renders (main canvas + all fixed
  // panels), so future phases can scope keyboard/clipboard/click
  // listeners here instead of window/document. tabIndex makes it
  // focusable: keydown only bubbles from whatever element currently
  // has focus, so this container must be able to hold focus itself
  // for shortcuts to work when nothing else is focused.
  let containerRef;
  let engine;
  let mouseModule; // cached after the first dynamic import, see onMount

  onMount(async () => {
    console.log("[MindMapCanvas] onMount, uuid =", props.uuid);
    containerRef.focus();
    engine = await import("../lib/mindmap/my-mind.js");
    engine.mount(mainRef, containerRef, props.uuid);
    console.log("[MindMapCanvas] mount() finished, uuid =", props.uuid);
    // Loaded separately from the engine module above so this component can
    // call mouse.js's handleContextMenu() directly from the Trigger below.
    mouseModule = await import("../lib/mindmap/mouse.js");
  });

  onCleanup(() => {
    console.log("[MindMapCanvas] onCleanup, uuid =", props.uuid);
    engine?.unmount();
  });

  return (
    <div
      ref={containerRef}
      id="mindmap-container"
      tabIndex="-1"
      class="outline-none"
    >
      {/* Kobalte's ContextMenu.Trigger owns opening/positioning the
          right-click menu (flip near screen edges, close on outside
          interaction/Escape, long-press support on touch) -- see
          ContextMenu.jsx for the rendered item list. mouse.js's
          handleContextMenu() still runs alongside it, for the
          item-selection/drag-cancel side effects the engine needs
          regardless of how the menu itself opens. modal={false} keeps
          the previous non-modal behavior: the canvas stays interactive
          and scroll is never locked just because the menu is open. */}
      <ContextMenu modal={false}>
        <ContextMenu.Trigger
          as="main"
          ref={mainRef}
          disabled={activeMode() !== "canvas"}
          onContextMenu={(e) => mouseModule?.handleContextMenu(e)}
        />
        <ContextMenuContent />
      </ContextMenu>

      <RightPanel />
      <ValueDialog />
      <FileSwitcher />
    </div>
  );
}
