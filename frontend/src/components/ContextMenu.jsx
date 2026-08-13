import { createSignal, For, onMount, Show } from "solid-js";
import { ContextMenu } from "@kobalte/core/context-menu";
import { isNewEngineEnabled } from "../lib/mindmap/newEngineFlag.js";

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
  // The ?newEngine=1 preview tracks selection in itemSelection.js, not
  // my-mind.js's app.currentItem -- calling the old command repo
  // against a currentItem the new engine never sets is what caused
  // edit/insert-child/insert-sibling/delete to throw (see
  // newContextMenuCommands.js).
  const newEngine = isNewEngineEnabled();
  let commandRepo;
  const [ready, setReady] = createSignal(false);

  onMount(async () => {
    ({ repo: commandRepo } = newEngine
      ? await import("../lib/mindmap/newContextMenuCommands.js")
      : await import("../lib/mindmap/command/command.js"));
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
