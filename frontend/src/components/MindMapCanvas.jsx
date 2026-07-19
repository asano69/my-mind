// frontend/src/components/MindMapCanvas.jsx
import RightPanel from "./RightPanel";

import SaveDialog from "./SaveDialog";
import ContextMenu from "./ContextMenu";
import { onMount, onCleanup } from "solid-js";

export default function MindMapCanvas() {
  let mainRef;
  // Wraps every element this route renders (main canvas + all fixed
  // panels), so future phases can scope keyboard/clipboard/click
  // listeners here instead of window/document. tabIndex makes it
  // focusable: keydown only bubbles from whatever element currently
  // has focus, so this container must be able to hold focus itself
  // for shortcuts to work when nothing else is focused.
  let containerRef;
  let engine;

  onMount(async () => {
    containerRef.focus();
    engine = await import("../lib/mindmap/my-mind.js");
    engine.mount(mainRef, containerRef);
  });

  onCleanup(() => {
    engine?.unmount();
  });

  return (
    <div ref={containerRef} tabIndex="-1" class="outline-none">
      <main ref={mainRef} />

      <RightPanel />
      <SaveDialog />
      <ContextMenu />
    </div>
  );
}
