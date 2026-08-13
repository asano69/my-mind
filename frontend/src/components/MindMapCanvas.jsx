// frontend/src/components/MindMapCanvas.jsx
import RightPanel from "./RightPanel";
import ValueDialog from "./ValueDialog";
import FileSwitcher from "./FileSwitcher";
import ErrorDialog from "./ErrorDialog";
import LeaveConfirmDialog from "./LeaveConfirmDialog";

import ContextMenuContent from "./ContextMenu";
import { ContextMenu } from "@kobalte/core/context-menu";
import { onMount, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import { activeMode } from "../lib/mindmap/store";
import { isNewEngineEnabled } from "../lib/mindmap/newEngineFlag.js";
import NewMindMapPreview from "./NewMindMapPreview.jsx";
import * as newKeyboard from "../lib/mindmap/newKeyboard.js";

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
  let disposeNewEngine;
  const newEngine = isNewEngineEnabled();
  let mouseModule; // cached after the first dynamic import, see onMount

  onMount(async () => {
    console.log("[MindMapCanvas] onMount, uuid =", props.uuid);
    containerRef.focus();

    if (newEngine) {
      disposeNewEngine = render(
        () => (
          <NewMindMapPreview
            uuid={props.uuid}
            title={new Date().toISOString().slice(0, 10)}
            containerEl={containerRef}
          />
        ),
        mainRef,
      );
      newKeyboard.init(containerRef);
      console.log(
        "[MindMapCanvas] new engine preview mounted, uuid =",
        props.uuid,
      );
      return;
    }

    engine = await import("../lib/mindmap/my-mind.js");
    engine.mount(mainRef, containerRef, props.uuid);
    console.log("[MindMapCanvas] mount() finished, uuid =", props.uuid);
    // Loaded separately from the engine module above so this component can
    // call mouse.js's handleContextMenu() directly from the Trigger below.
    mouseModule = await import("../lib/mindmap/mouse.js");
  });

  onCleanup(() => {
    console.log("[MindMapCanvas] onCleanup, uuid =", props.uuid);
    if (newEngine) {
      newKeyboard.dispose(containerRef);
    }
    disposeNewEngine?.();
    disposeNewEngine = null;
    engine?.unmount();
  });

  return (
    <div
      ref={containerRef}
      id="mindmap-container"
      tabIndex="-1"
      class="outline-none fixed inset-0"
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
          onContextMenu={(e) => {
            if (!newEngine) {
              mouseModule?.handleContextMenu(e);
            }
          }}
        />
        <ContextMenuContent />
      </ContextMenu>

      <RightPanel />
      <ValueDialog />
      <FileSwitcher />
      <ErrorDialog />
      <LeaveConfirmDialog />
    </div>
  );
}
