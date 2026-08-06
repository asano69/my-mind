import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { contextMenuPoint, setContextMenuPoint } from "../lib/mindmap/store";

// Explicit groups (and the separators between them) mirror the old static
// markup's ordering exactly, rather than pulling every registered command
// into the menu.
const GROUPS = [
  ["notes"],
  ["insert-child", "insert-sibling", "delete"],
  ["edit", "value"],
  ["undo", "redo", "center"],
];

// The right-click item menu. Fully reactive: store.js's contextMenuPoint
// signal is the only source of truth for whether the menu is open and
// where, so there is no imperative DOM node to hold onto or hide/show by
// hand anymore (see ui/context-menu.js, now just a thin open()/close()
// wrapper around this signal).
export default function ContextMenu() {
  let menuRef;
  // command/command.js is imported dynamically (like TopBar.jsx/
  // LeftPanel.jsx/RightPanel.jsx already do), not statically at the top
  // of this file. ContextMenu.jsx sits on the static import chain
  // main.jsx -> Workspace.jsx -> MindMapCanvas.jsx, which now runs before
  // my-mind.js ever gets a chance to be the first module to import
  // command.js. command.js and my-mind.js import each other (a command's
  // execute() calls into app.*, and my-mind.js imports command modules
  // for their registration side effects) -- whichever module starts
  // loading first "wins" that circular pair. A static import here made
  // command.js load first, which meant my-mind.js's own
  // `import "./command/edit.js"` line ran while command.js was still
  // mid-evaluation, before its `export default class Command` had run,
  // throwing a TDZ ReferenceError. Deferring this import to onMount
  // avoids becoming that first entry point.
  let commandRepo;
  const [ready, setReady] = createSignal(false);

  onMount(async () => {
    ({ repo: commandRepo } = await import("../lib/mindmap/command/command.js"));
    setReady(true);
  });

  function run(id, e) {
    // Attached via on:click (a real listener on the button itself, fired
    // at the target phase) rather than Solid's default delegated onClick
    // (which only runs once the event has already bubbled all the way up
    // to document). stopPropagation() here must happen before ui/ui.js's
    // delegated click listener on containerEl runs, or that listener
    // would execute the same command a second time.
    e.stopPropagation();
    const command = commandRepo.get(id);
    if (!command.isValid) {
      return;
    }
    command.execute();
    setContextMenuPoint(null);
  }

  // Positions the menu near the click point, flipping to the opposite
  // side whenever it would otherwise overflow past the middle of the
  // screen -- same heuristic the old context-menu.js used, just driven by
  // the rendered menu's own measured size (via the ref) instead of a DOM
  // node it held onto imperatively.
  createEffect(() => {
    const point = contextMenuPoint();
    if (!point || !menuRef) {
      return;
    }
    let left = point.x;
    let top = point.y;
    if (left > window.innerWidth / 2) {
      left -= menuRef.offsetWidth;
    }
    if (top > window.innerHeight / 2) {
      top -= menuRef.offsetHeight;
    }
    menuRef.style.left = `${left}px`;
    menuRef.style.top = `${top}px`;
  });

  // Closes the menu on any mousedown outside it -- e.g. clicking the
  // canvas, another node, or a panel. The old context-menu.js got this
  // for free by also listening for "mousedown" on `port` itself and
  // closing whenever the event's currentTarget wasn't its own node; that
  // whole listener is gone now; this effect (only live while the menu is
  // actually open) is what replaces it.
  createEffect(() => {
    if (!contextMenuPoint()) {
      return;
    }
    function onOutsideMouseDown(e) {
      if (!menuRef?.contains(e.target)) {
        setContextMenuPoint(null);
      }
    }
    document.addEventListener("mousedown", onOutsideMouseDown, true);
    onCleanup(() =>
      document.removeEventListener("mousedown", onOutsideMouseDown, true),
    );
  });

  return (
    <Show when={ready() && contextMenuPoint()}>
      <div
        id="context-menu"
        ref={menuRef}
        class="absolute flex w-[130px] flex-col overflow-hidden rounded-md
          border border-[#bbb] bg-pane py-[3px] shadow-card"
      >
        <For each={GROUPS}>
          {(group, i) => (
            <>
              <Show when={i() > 0}>
                <span class="my-[3px] border-t border-[color:var(--color-border-menu)]"></span>
              </Show>
              <For each={group}>
                {(id) => (
                  <button
                    disabled={!commandRepo.get(id).isValid}
                    on:click={[run, id]}
                    class="bg-transparent px-2.5 py-[5px] text-left text-sm
                      transition-colors duration-[80ms] hover:bg-hover
                      hover:text-text disabled:opacity-40"
                  >
                    {commandRepo.get(id).label}
                  </button>
                )}
              </For>
            </>
          )}
        </For>
      </div>
    </Show>
  );
}
