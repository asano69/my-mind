import { createSignal, onMount, For } from "solid-js";
import { getVersion } from "../lib/mindmap/backend/pocketbase";

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
  // Visibility itself lives in store.js's helpHidden signal, read/written
  // directly — no bridge object needed (see CLAUDE.md's Phase 5 addendum,
  // "read-only consumption — no bridge object"). command.js's Help command
  // and edit.js's Cancel command write to it directly.
  const [sections, setSections] = createSignal([]);
  // Best-effort: an empty string just renders no footer text if the
  // request fails, rather than blocking the (more important) command
  // table above on the network.
  const [version, setVersion] = createSignal("");

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
    getVersion()
      .then(setVersion)
      .catch(() => {});
  });

  // Rendered inline inside LeftPanel.jsx's scrollable content area (see
  // LeftPanel.jsx), the same way SnapshotsList.jsx is — no more fixed
  // `.pane` wrapper of its own. Small text + horizontal scroll so long
  // key combinations don't wrap or overflow the sidebar.
  return (
    <div class="flex h-full flex-col">
      <div class="flex-1 overflow-x-auto text-xs">
        <For each={sections()}>
          {(section) => (
            <div class="mb-3">
              <p class="mb-1 text-[11px] font-semibold tracking-wider text-text/60 uppercase">
                {section.title}
              </p>
              <table class="w-full whitespace-nowrap text-xs leading-tight">
                <For each={section.rows}>
                  {(row) => (
                    <tr>
                      <td class="py-0.5 pr-3">{row.labels}</td>
                      <td class="py-0.5 text-right text-text/50">
                        {row.keys}
                      </td>
                    </tr>
                  )}
                </For>
              </table>
            </div>
          )}
        </For>
      </div>
      {/* Mirrors RightPanel.jsx's footer (border-t, min-h-[28px],
          flex items-center justify-between, same padding) so the two
          side panels' footers read as a matching pair. */}
      <footer class="flex min-h-[28px] flex-none items-center justify-between border-t border-black/10 px-3 py-1.5">
        <span class="text-xs text-text/50">{version() && `v${version()}`}</span>
      </footer>
    </div>
  );
}
