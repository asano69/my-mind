import { createSignal, onMount, onCleanup, For } from "solid-js";

// Static shape of the help table: section title + which commands make up
// each row. commandRepo is only resolved at mount time (see onMount below),
// but this layout itself never changes, so it lives outside the component.
const SECTIONS = [
  {
    title: "Navigation",
    rows: [
      ["pan"],
      ["select"],
      ["select-root"],
      ["select-parent"],
      ["center"],
      ["zoom-in", "zoom-out"],
      ["fold"],
    ],
  },
  {
    title: "Manipulation",
    rows: [
      ["insert-sibling"],
      ["insert-child"],
      ["swap"],
      ["side"],
      ["delete"],
    ],
  },
  {
    title: "Editing",
    rows: [
      ["value"],
      ["yes", "no", "computed"],
      ["edit"],
      ["newline"],
      ["bold"],
      ["italic"],
      ["underline"],
      ["strikethrough"],
    ],
  },
  {
    title: "Other",
    rows: [
      ["undo", "redo"],
      ["save"],
      ["copy-image"],
      ["recover"],
      ["new"],
      ["help"],
      ["notes"],
      ["ui"],
      ["quick-load"],
      ["go-to-catalog"],
    ],
  },
];

const KEY_LABELS = {
  Enter: "↩",
  Space: "Spacebar",
  ArrowLeft: "←",
  ArrowUp: "↑",
  ArrowRight: "→",
  ArrowDown: "↓",
  "-": "−",
};

function formatKey(key) {
  let str = "";
  if (key.ctrlKey) {
    str += "Ctrl+";
  }
  if (key.altKey) {
    str += "Alt+";
  }
  if (key.shiftKey) {
    str += "Shift+";
  }
  if (key.key) {
    str += KEY_LABELS[key.key] || key.key.toUpperCase();
  }
  if (key.code) {
    str += key.code.startsWith("Key")
      ? key.code.substring(3)
      : KEY_LABELS[key.code] || key.code;
  }
  return str;
}

// Builds one row's { labels, keys } strings from the command repo. A
// missing command name is logged and skipped, matching the old
// ui/help.js's buildRow() behavior.
function buildRow(commandRepo, commandNames) {
  const labels = [];
  let keys = [];
  commandNames.forEach((name) => {
    const command = commandRepo.get(name);
    if (!command) {
      console.warn(name);
      return;
    }
    labels.push(command.label);
    keys = keys.concat(command.keys.map(formatKey));
  });
  return { labels: labels.join("/"), keys: keys.join("/") };
}

export default function HelpPanel() {
  // Local signal for the derived section data (command labels/keys) only.
  // Visibility itself now lives in store.js's helpHidden signal, so no
  // bridge object is needed to toggle it (see CLAUDE.md's Phase 5
  // addendum, "read-only consumption — no bridge object").
  const [sections, setSections] = createSignal([]);

  onMount(async () => {
    // Import the same three command modules my-mind.js imports for their
    // side effects (populating commandRepo), so the table is complete
    // regardless of import order relative to the engine's own mount.
    const [{ repo: commandRepo }] = await Promise.all([
      import("../lib/mindmap/command/command.js"),
      import("../lib/mindmap/command/edit.js"),
      import("../lib/mindmap/command/select.js"),
    ]);
    setSections(
      SECTIONS.map((section) => ({
        title: section.title,
        rows: section.rows.map((names) => buildRow(commandRepo, names)),
      })),
    );

    helpModule = await import("../lib/mindmap/help.js");
    helpModule.registerToggle({
      toggle: () => setHidden((h) => !h),
      close: () => setHidden(true),
    });
  });
  // help.js has no raw DOM listeners of its own — it's only a bridge
  // object for this component's toggle state — so its cleanup can live
  // directly in this component's onCleanup instead of my-mind.js's manual
  // unmount() chain (see CLAUDE.md, Solid migration Phase 9).
  onCleanup(() => {
    helpModule?.dispose();
  });

  return (
    <div id="help" class="pane" hidden={hidden()}>
      <h3>Help</h3>
      <For each={sections()}>
        {(section) => (
          <div>
            <p>{section.title}</p>
            <table>
              <For each={section.rows}>
                {(row) => (
                  <tr>
                    <td>{row.labels}</td>
                    <td>{row.keys}</td>
                  </tr>
                )}
              </For>
            </table>
          </div>
        )}
      </For>
    </div>
  );
}
