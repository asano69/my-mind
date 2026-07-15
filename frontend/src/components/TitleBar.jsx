import { createSignal, onMount } from "solid-js";

/**
 * Floating title bar shown at the top of the canvas, where a header or
 * nav bar would normally sit. Lets the user rename the current mind map.
 *
 * Interaction with the mindmap engine is delegated to title.js, using the
 * same "dynamic import + register API" pattern as NotesEditor.jsx: title.js
 * touches live engine state (the current map) that only exists once
 * my-mind.js has booted.
 */
export default function TitleBar() {
  let titleModule; // cached after the first dynamic import, see onMount
  const [value, setValue] = createSignal("");

  function commit(e) {
    titleModule?.rename(e.target.value);
  }

  onMount(async () => {
    titleModule = await import("../lib/mindmap/title.js");
    titleModule.registerInput({ setValue });
  });

  return (
    <input
      type="text"
      value={value()}
      onInput={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      placeholder="Untitled"
      class="fixed top-2 left-1/2 z-10 w-80 -translate-x-1/2 rounded-md
        border border-transparent bg-transparent px-2 py-1 text-center
        font-serif text-lg text-text outline-none transition-colors
        hover:bg-pane-hover focus:border-pane-hover focus:bg-pane"
    />
  );
}
