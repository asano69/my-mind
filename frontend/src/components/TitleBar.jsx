import { createSignal, onMount, onCleanup } from "solid-js";

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

  // TitleBar lives at the Workspace level and stays mounted across map
  // switches (only MindMapCanvas remounts, see Workspace.jsx's keyed
  // <Show>). It only truly unregisters when it unmounts itself, e.g.
  // leaving Workspace entirely for /catalog — not on every engine
  // mount()/unmount() cycle (see title.js's dispose()).
  onCleanup(() => {
    titleModule?.unregisterInput();
  });

  return (
    <input
      type="text"
      value={value()}
      onInput={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      placeholder="Untitled"
    class="fixed top-2 left-1/2 w-80 -translate-x-1/2 rounded-md
  border border-transparent bg-pane px-2 py-1 text-center
  font-serif text-lg text-text outline-none transition-colors
  hover:bg-pane-hover focus:border-pane-hover focus:bg-pane"
      // "z-4" is not a real Tailwind utility (the default scale only
      // has z-0/10/20/30/40/50/auto), so it silently compiled to
      // nothing and left this input at z-index:auto. That put it
      // below Workspace.jsx's canvas/notes overlay divs, which set an
      // explicit z-index via inline style — so the overlay div
      // silently ate every click/double-click over the title, even
      // though the text still rendered underneath it. Use a real,
      // always-compiling inline z-index instead.
      style={{ "z-index": 10 }}
    />
  );
}
