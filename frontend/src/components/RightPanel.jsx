import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Switch } from "@kobalte/core/switch";
import {
  autoSaveEnabled,
  currentItem,
  lastSaveTime,
  rightPanelHidden,
  toggleRightPanel,
} from "../lib/mindmap/store";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Spinner from "./Spinner";
import SelectField from "./SelectField";

import Logo from "./Logo";

const STATUS_MAP = { yes: true, no: false, "": null };

const COLOR_SWATCHES = [
  { value: "", title: "Inherit" },
  { value: "#000", title: "Black" },
  { value: "#d33", title: "Red" },
  { value: "#33d", title: "Blue" },
  { value: "#3d3", title: "Green" },
  { value: "#d3d", title: "Magenta" },
  { value: "#3dd", title: "Cyan" },
  { value: "#dd3", title: "Yellow" },
];

// Static option lists for SelectField (see ./SelectField.jsx). Layout
// and Shape depend on the engine's registered repos, so their option
// lists stay computed memos inside the component below; Value and
// Status never change, so they live here as plain module-level data.
const VALUE_OPTIONS = [
  { value: "", label: "(None)" },
  { value: "num", label: "Number" },
  {
    label: "Formula",
    options: [
      { value: "sum", label: "Sum" },
      { value: "avg", label: "Average" },
      { value: "min", label: "Minimum" },
      { value: "max", label: "Maximum" },
    ],
  },
];

const STATUS_OPTIONS = [
  { value: "", label: "None" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "computed", label: "Autocompute" },
];

function statusToString(status) {
  for (let key in STATUS_MAP) {
    if (STATUS_MAP[key] === status) {
      return key;
    }
  }
  return String(status);
}

// A labeled row of clickable color swatches. Shared by the item-color and
// text-color pickers below (props.onClick receives the raw click event,
// same delegation pattern the old .color-picker markup used).
function ColorPicker(props) {
  return (
    <div class="border-b border-black/[0.07] px-3 py-2">
      <label class="block">
        <span class="mb-1 block text-[11px] font-semibold tracking-wider text-text/70 uppercase">
          {props.label}
        </span>
        <span
          class="mt-1 flex flex-row flex-wrap gap-1.5"
          onClick={props.onClick}
        >
          <For each={COLOR_SWATCHES}>
            {(c) => (
              <a
                data-color={c.value}
                title={c.title}
                href="#"
                class="h-5 w-5 rounded-[5px] shadow-[0_1px_4px_rgba(0,0,0,0.8)] transition-transform hover:scale-125"
                style={c.value ? { "background-color": c.value } : {}}
              ></a>
            )}
          </For>
        </span>
      </label>
    </div>
  );
}

// The property panel (#ui) — layout/shape/value/status controls for the
// currently selected item, color pickers, the save-status footer, and the
// save spinner. Structured as a ribbon-or-expanded sidebar, mirroring
// LeftPanel.jsx: a slim always-visible icon column pinned to the screen
// edge (here, the right edge) plus a wider content area that animates in
// and out by width instead of the old `.pane` slide-off-screen behavior.
//
// Visibility is store.js's `rightPanelHidden` signal, read/written
// directly — no bridge object needed (see CLAUDE.md's Phase 5 addendum,
// "read-only consumption — no bridge object"), same as LeftPanel.jsx's
// `leftPanelHidden`.
export default function RightPanel() {
  // Cached after the first dynamic import, see onMount. Loaded lazily
  // (like title.js/notes.js) so the engine bundle isn't pulled in before
  // the canvas actually mounts.
  let actionsModule;
  let appModule;
  let commandRepo;
  let layoutRepo;
  let shapeRepo;
  let ioModule;

  const [ready, setReady] = createSignal(false);

  // Ticks once a second while this panel is mounted, purely to drive
  // re-renders of the save-status label below -- lastSaveTime() itself
  // only changes on an actual save, not every second, so the "<5s ago" /
  // "2m ago" text needs something else advancing it.
  const [tick, setTick] = createSignal(0);
  let tickTimer;

  onMount(async () => {
    const [actionsMod, appMod, cmdMod, layoutMod, shapeMod, ioMod] =
      await Promise.all([
        import("../lib/mindmap/action.js"),
        import("../lib/mindmap/my-mind.js"),
        import("../lib/mindmap/command/command.js"),
        import("../lib/mindmap/layout/layout.js"),
        import("../lib/mindmap/shape/shape.js"),
        import("../lib/mindmap/ui/io.js"),
      ]);
    actionsModule = actionsMod;
    appModule = appMod;
    commandRepo = cmdMod.repo;
    layoutRepo = layoutMod.repo;
    shapeRepo = shapeMod.repo;
    ioModule = ioMod;

    setReady(true);
  });

  tickTimer = setInterval(() => setTick((t) => t + 1), 1000);
  onCleanup(() => clearInterval(tickTimer));

  const saveStatusLabel = createMemo(() => {
    tick();
    if (!ioModule) {
      return "";
    }
    return ioModule.formatSaveStatus(lastSaveTime());
  });

  const layoutGroups = createMemo(() => {
    if (!ready()) {
      return null;
    }
    return {
      map: layoutRepo.get("map"),
      graph: ["right", "left", "bottom", "top"].map((name) =>
        layoutRepo.get(`graph-${name}`),
      ),
      tree: ["right", "left"].map((name) => layoutRepo.get(`tree-${name}`)),
    };
  });

  const shapeList = createMemo(() => {
    if (!ready()) {
      return [];
    }
    return [...shapeRepo.values()];
  });

  const isRoot = createMemo(() => {
    return !!currentItem()?.isRoot;
  });

  // Option lists for SelectField (see ./SelectField.jsx), replacing the
  // <option>/<optgroup> markup the old native <select> rendered directly.
  const layoutOptions = createMemo(() => {
    const groups = layoutGroups();
    const items = [{ value: "", label: "(Inherit)", disabled: isRoot() }];
    if (groups) {
      items.push({
        value: "map",
        label: groups.map.label,
        disabled: !isRoot(),
      });
      items.push({
        label: "Graph",
        options: groups.graph.map((l) => ({ value: l.id, label: l.label })),
      });
      items.push({
        label: "Tree",
        options: groups.tree.map((l) => ({ value: l.id, label: l.label })),
      });
    }
    return items;
  });

  const shapeOptions = createMemo(() => [
    { value: "", label: "(Automatic)" },
    ...shapeList().map((s) => ({ value: s.id, label: s.label })),
  ]);

  const layoutValue = createMemo(() => {
    const item = currentItem();
    return item?.layout ? item.layout.id : "";
  });

  const shapeValue = createMemo(() => {
    const item = currentItem();
    return item?.shape ? item.shape.id : "";
  });

  const valueValue = createMemo(() => {
    const item = currentItem();
    if (!item) {
      return "";
    }
    const v = item.value;
    if (v === null) {
      return "";
    }
    return typeof v === "number" ? "num" : v;
  });

  const statusValue = createMemo(() => {
    const item = currentItem();
    return item ? statusToString(item.status) : "";
  });

  // Kobalte's Select trigger is a <button>, not a native <select>, so
  // there is no event target to blur directly here (unlike the old
  // e.target.blur()). Blur whichever element is currently focused,
  // which is the trigger button right after a selection, so keyboard
  // shortcuts keep working the same way they did before this refactor.
  function returnFocusToCanvas() {
    document.activeElement?.blur();
  }

  function setLayout(value) {
    const item = currentItem();
    if (!item) {
      return;
    }
    const layout = layoutRepo.get(value);
    appModule.action(new actionsModule.SetLayout(item, layout));
    returnFocusToCanvas();
  }

  function setShape(value) {
    const item = currentItem();
    if (!item) {
      return;
    }
    const shape = shapeRepo.get(value);
    appModule.action(new actionsModule.SetShape(item, shape));
    returnFocusToCanvas();
  }

  function setValue(value) {
    const item = currentItem();
    if (!item) {
      return;
    }
    if (value === "num") {
      // Same prompt()-based flow as the "value" keyboard shortcut/command.
      commandRepo.get("value").execute();
    } else {
      appModule.action(new actionsModule.SetValue(item, value || null));
    }
    returnFocusToCanvas();
  }

  function setStatus(value) {
    const item = currentItem();
    if (!item) {
      return;
    }
    const status = value in STATUS_MAP ? STATUS_MAP[value] : value;
    appModule.action(new actionsModule.SetStatus(item, status));
    returnFocusToCanvas();
  }

  function setColor(e) {
    e.preventDefault();
    const color = e.target.dataset.color;
    const item = currentItem();
    if (color === undefined || !item || !actionsModule) {
      return;
    }
    appModule.action(new actionsModule.SetColor(item, color));
  }

  function setTextColor(e) {
    e.preventDefault();
    const color = e.target.dataset.color;
    const item = currentItem();
    if (color === undefined || !item || !actionsModule) {
      return;
    }
    appModule.action(new actionsModule.SetTextColor(item, color));
  }

  // Persists the auto-save on/off preference via ui/io.js's
  // setAutoSave(), which both updates store.js's signal and writes it
  // to PocketBase's settings collection.
  function handleAutoSaveChange(checked) {
    ioModule?.setAutoSave(checked);
  }

  return (
    <>
      <div
        id="ui"
        class="fixed inset-y-0 right-0 z-5 flex overflow-hidden bg-pane shadow-card transition-[width] duration-300 ease-in-out"
        style={{
          width: rightPanelHidden() ? "0px" : "var(--side-panel-width)",
        }}
      >
        <div
          class="flex min-h-0 min-w-0 flex-1 flex-col transition-opacity duration-200"
          classList={{
            "opacity-0": rightPanelHidden(),
            "pointer-events-none": rightPanelHidden(),
          }}
        >
          <div class="flex-1 overflow-y-auto">
            <div class="flex justify-center p-1 border-b border-black/10"> 
              <Logo size={28} showTitle linkable centerTitle />
            </div>
            <SelectField
              label="Layout"
              value={layoutValue()}
              onChange={setLayout}
              disabled={!ready() || !currentItem()}
              options={layoutOptions()}
            />

            <SelectField
              label="Shape"
              value={shapeValue()}
              onChange={setShape}
              disabled={!ready() || !currentItem()}
              options={shapeOptions()}
            />

            <SelectField
              label="Value"
              value={valueValue()}
              onChange={setValue}
              disabled={!ready() || !currentItem()}
              options={VALUE_OPTIONS}
            />

            <SelectField
              label="Status"
              value={statusValue()}
              onChange={setStatus}
              disabled={!ready() || !currentItem()}
              options={STATUS_OPTIONS}
            />

            <ColorPicker label="Item color" onClick={setColor} />
            <ColorPicker label="Text color" onClick={setTextColor} />
          </div>

          <footer class="flex min-h-[28px] flex-none items-center justify-between border-t border-black/10 px-3 py-1.5">
            <Switch
              checked={autoSaveEnabled()}
              onChange={handleAutoSaveChange}
              disabled={!ready()}
              class="flex items-center gap-1.5"
            >
              <Switch.Input />
              <Switch.Control class="relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full bg-pane-hover transition-colors data-[checked]:bg-accent">
                <Switch.Thumb class="block h-3 w-3 translate-x-0.5 rounded-full bg-white transition-transform data-[checked]:translate-x-[14px]" />
              </Switch.Control>
              <Switch.Label class="cursor-pointer text-xs text-text/70 select-none">
                Auto-save
              </Switch.Label>
            </Switch>
            <span class="pr-0.5 text-base text-text">{saveStatusLabel()}</span>
          </footer>
        </div>

        <Spinner />
      </div>

      {/* Tab handle: lives outside #ui so it stays visible even when the
          panel collapses to zero width (no ribbon column anymore). It
          tracks the panel's left edge via the same `right` offset/duration
          as #ui's own width transition, so it slides together with the
          panel instead of jumping at the end of the animation. */}
      <button
        class="fixed top-1/2 z-4 flex h-14 w-5 -translate-y-1/2 items-center
          justify-center rounded-l-lg bg-pane text-accent shadow-card
          transition-[right] duration-300 ease-in-out hover:bg-pane-hover"
        style={{
          right: rightPanelHidden() ? "0px" : "var(--side-panel-width)",
        }}
        onClick={toggleRightPanel}
        title="Toggle sidebar"
      >
        <Show when={rightPanelHidden()} fallback={<ChevronRight size={16} />}>
          <ChevronLeft size={16} />
        </Show>
      </button>
    </>
  );
}
