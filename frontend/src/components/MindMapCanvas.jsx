// frontend/src/components/MindMapCanvas.jsx
import RightPanel from "./RightPanel";
import ValueDialog from "./ValueDialog";
import FileSwitcher from "./FileSwitcher";
import ErrorDialog from "./ErrorDialog";
import LeaveConfirmDialog from "./LeaveConfirmDialog";

import ContextMenuContent from "./ContextMenu";
import { ContextMenu } from "@kobalte/core/context-menu";
import { createEffect, onMount, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import { activeMode } from "../lib/mindmap/store";
import NewMindMapPreview from "./NewMindMapPreview.jsx";
import * as newKeyboard from "../lib/mindmap/core/newKeyboard.js";
import * as newMouse from "../lib/mindmap/core/newMouse.js";
import * as scope from "../lib/mindmap/core/scope.js";
import * as title from "../lib/mindmap/title.js";

export default function MindMapCanvas(props) {
  let mainRef;
  // Wraps every element this route renders (main canvas + all fixed
  // panels), so future phases can scope keyboard/clipboard/click
  // listeners here instead of window/document. tabIndex makes it
  // focusable: keydown only bubbles from whatever element currently
  // has focus, so this container must be able to hold focus itself
  // for shortcuts to work when nothing else is focused.
  let containerRef;
  let disposeEngine;

  onMount(() => {
    console.log("[MindMapCanvas] onMount, uuid =", props.uuid);
    containerRef.focus();

    disposeEngine = render(
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
    // Was previously started by the old engine's my-mind.js mount() --
    // that's gone, so this is now the sole engine-lifecycle owner of
    // document.title syncing.
    title.init();
    console.log("[MindMapCanvas] engine mounted, uuid =", props.uuid);
  });

  onCleanup(() => {
    console.log("[MindMapCanvas] onCleanup, uuid =", props.uuid);
    newKeyboard.dispose(containerRef);
    title.dispose();
    disposeEngine?.();
    disposeEngine = null;
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
          ContextMenu.jsx for the rendered item list. newMouse.js's
          handleContextMenu() still runs alongside it, for the
          item-selection/drag-cancel side effects the engine needs
          regardless of how the menu itself opens. modal={false} keeps
          the previous non-modal behavior: the canvas stays interactive
          and scroll is never locked just because the menu is open. */}
      <ContextMenu modal={false}>
        {/* Explicit full-viewport sizing so the right-click hit area covers
            the whole canvas. NewMindMapPreview.jsx never sizes this
            element itself -- without this, <main> collapses to the
            height of its absolutely positioned <svg> child and
            right-click only worked near the map. */}
        <ContextMenu.Trigger
          as="main"
          ref={mainRef}
          class="fixed inset-0"
          disabled={activeMode() !== "canvas"}
          onContextMenu={(e) => newMouse.handleContextMenu(e)}
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
