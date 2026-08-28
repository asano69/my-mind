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
import {
  activeMode,
  bumpDirty,
  titleAuto,
  setCurrentTitle,
  setErrorDialogMessage,
} from "../lib/mindmap/store";
import NewMindMapPreview from "./NewMindMapPreview.jsx";
import * as title from "../lib/mindmap/title.js";
import { setBaseScope } from "mindmap-engine";
import { newMouse, newKeyboard } from "../lib/mindmap/engineInstance.js";
import * as io from "../lib/mindmap/ui/io.js";
import { loadByUuid } from "../lib/mindmap/backend/pocketbase.js";

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
  // Guards against the map-load fetch in onMount below resolving after
  // this component has already been torn down (e.g. rapid map
  // switching via the catalog/file-switcher) -- without this, render()
  // could mount a fresh Solid tree into a mainRef that has already
  // detached from the DOM.
  let cancelled = false;

  // Syncs core/scope.js's base input scope with the host's canvas/notes
  // mode. Required per docs/mind-map-core-engine-library.md's Step 2:
  // scope.js no longer reads store.js's activeMode itself, so without
  // this the engine's own isCanvasActive() stays stuck at "canvas"
  // forever, and newKeyboard.js/newClipboard.js (neither of which is
  // blocked by Workspace.jsx's pointer-events-none, unlike newMouse.js)
  // keep reacting to canvas shortcuts and clipboard events while Notes
  // mode is in front.
  createEffect(() => {
    setBaseScope(activeMode());
  });

  onMount(async () => {
    console.log("[MindMapCanvas] onMount, uuid =", props.uuid);

    containerRef.focus();

    // Fetches the map record here, before the renderer ever mounts, so
    // NewMindMapPreview.jsx no longer needs to import backend/pocketbase.js
    // itself -- see docs/mind-map-core-engine-library/01-plan.md's Step
    // 4a. A load failure (e.g. an unknown uuid) surfaces the same error
    // dialog io.js's old restore() used to show, instead of leaving the
    // canvas with nothing ever rendered.
    let record = null;
    if (props.uuid) {
      try {
        record = await loadByUuid(props.uuid);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setErrorDialogMessage(`Failed to load map: ${message}`);
      }
    }
    if (cancelled) {
      return;
    }

    disposeEngine = render(
      () => (
        <NewMindMapPreview
          uuid={props.uuid}
          title={new Date().toISOString().slice(0, 10)}
          initialData={record?.mymind}
          mapRecord={record}
          containerEl={containerRef}
          // Owns the actual ui/io.js calls on the renderer's behalf --
          // see docs/mind-map-core-engine-library/01-plan.md's Step 4b.
          // The renderer itself only calls these callbacks at the same
          // points it used to call io.init()/dispose()/detach()/
          // attach()/setCurrentMap() directly.
          onMount={() => io.init()}
          onUnmount={() => {
            io.dispose();
            io.detach();
            io.registerRestoreRoot(null);
          }}
          onRootReady={(root, svgNode, loadedRecord) => {
            io.attach(root, svgNode);
            if (loadedRecord) {
              io.setCurrentMap(loadedRecord);
            }
          }}
          onDirty={() => bumpDirty()}
          onTitleChange={(name) => {
            if (titleAuto()) {
              setCurrentTitle(name);
            }
          }}
          // Registers this mounted instance's restoreRoot() with io.js
          // (see docs/mind-map-core-engine-library/01-plan.md's Step
          // 4e), so ui/io.js's restoreSnapshot() can swap in a restored
          // snapshot's root without this component (or io.js) touching
          // store.js's old overrideRoot signal.
          onEngineReady={(api) => io.registerRestoreRoot(api.restoreRoot)}
        />
      ),
      mainRef,
    );

    newKeyboard.init(containerRef);

    // Registers appCommands.js's repo (save/notes/file-switcher/
    // go-to-catalog/new) as newKeyboard.js's fallback command source --
    // see docs/mind-map-core-engine-library/01-plan.md's Step 3. Without
    // this, newKeyboard.js only ever falls back to engineCommands.js
    // (core/**-only), so every app-level keyboard shortcut (Ctrl+Shift+S,
    // Ctrl+M, Ctrl+K, Ctrl+P, Ctrl+Shift+O) silently stopped firing once
    // the merged repo was split.
    const { repo: appCommandRepo } =
      await import("../lib/mindmap/appCommands.js");
    newKeyboard.registerExtraCommands(appCommandRepo);

    // Was previously started by the old engine's my-mind.js mount() --
    // that's gone, so this is now the sole engine-lifecycle owner of
    // document.title syncing.
    title.init();

    console.log("[MindMapCanvas] engine mounted, uuid =", props.uuid);
  });

  onCleanup(() => {
    console.log("[MindMapCanvas] onCleanup, uuid =", props.uuid);

    cancelled = true;
    newKeyboard.registerExtraCommands(null);
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
