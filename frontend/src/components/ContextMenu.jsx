import { createSignal, For, onMount, Show } from "solid-js";
import { ContextMenu } from "@kobalte/core/context-menu";

// Explicit groups (and the separators between them) mirror the old static
// markup's ordering exactly, rather than pulling every registered command
// into the menu.
const GROUPS = [
  ["notes"],
  ["insert-child", "insert-sibling", "delete"],
  ["edit", "value"],
  ["undo", "redo", "center"],
];

// The right-click item menu's content, rendered as a child of Kobalte's
// <ContextMenu> root whose <ContextMenu.Trigger> wraps the mind-map
// canvas (see MindMapCanvas.jsx). Kobalte owns opening the menu at the
// pointer, flipping it near screen edges, and closing it on outside
// interaction, Escape, or item selection -- none of that lives in this
// module anymore (see ui/context-menu.js's removal and mouse.js's
// handleContextMenu()).
export default function ContextMenuContent() {
  // Deferred to onMount (rather than a static top-of-file import) so
  // this component's command repo is only pulled in once the canvas
  // actually mounts, matching TopBar.jsx/LeftPanel.jsx/RightPanel.jsx's
  // own lazy-import pattern for the same modules.
  let commandRepo;
  const [ready, setReady] = createSignal(false);

  onMount(async () => {
    ({ repo: commandRepo } =
      await import("../lib/mindmap/newContextMenuCommands.js"));
    setReady(true);
  });

  function run(id) {
    commandRepo.get(id).execute();
  }

  return (
    <Show when={ready()}>
      <ContextMenu.Portal>
        <ContextMenu.Content
          class="z-20 flex w-[130px] flex-col overflow-hidden rounded-md
            border border-[#bbb] bg-pane py-[3px] shadow-card"
        >
          <For each={GROUPS}>
            {(group, i) => (
              <>
                <Show when={i() > 0}>
                  <ContextMenu.Separator class="my-[3px] border-t border-[color:var(--color-border-menu)]" />
                </Show>
                <For each={group}>
                  {(id) => (
                    <ContextMenu.Item
                      disabled={!commandRepo.get(id).isValid}
                      onSelect={() => run(id)}
                      class="px-2.5 py-[5px] text-left text-sm
                        transition-colors duration-[80ms]
                        data-[highlighted]:bg-hover data-[highlighted]:text-text
                        data-[disabled]:opacity-40"
                    >
                      {commandRepo.get(id).label}
                    </ContextMenu.Item>
                  )}
                </For>
              </>
            )}
          </For>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </Show>
  );
}
