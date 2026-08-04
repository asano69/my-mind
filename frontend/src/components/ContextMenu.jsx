import { createEffect, For, Show } from "solid-js";
import { contextMenuPoint, setContextMenuPoint } from "../lib/mindmap/store";
import { repo as commandRepo } from "../lib/mindmap/command/command.js";

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

  return (
    <Show when={contextMenuPoint()}>
      <div id="context-menu" ref={menuRef}>
        <For each={GROUPS}>
          {(group, i) => (
            <>
              <Show when={i() > 0}>
                <span></span>
              </Show>
              <For each={group}>
                {(id) => (
                  <button
                    disabled={!commandRepo.get(id).isValid}
                    on:click={[run, id]}
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
