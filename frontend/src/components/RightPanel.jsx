import { createMemo, createSignal, For, onMount } from "solid-js";
import {
  currentItem,
  rightPanelHidden,
  toggleRightPanel,
} from "../lib/mindmap/store";
import PanelRight from "lucide-solid/icons/panel-right";

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

function statusToString(status) {
  for (let key in STATUS_MAP) {
    if (STATUS_MAP[key] === status) {
      return key;
    }
  }
  return String(status);
}

// A labeled <select> row. Shared by the Layout/Shape/Value/Status fields
// below so their styling lives in one place instead of four.
function Field(props) {
  return (
    <div class="border-b border-black/[0.07] px-3 py-2">
      <label class="block">
        <span class="mb-1 block text-[11px] font-semibold tracking-wider text-text/70 uppercase">
          {props.label}
        </span>
        <select
          value={props.value}
          onChange={props.onChange}
          disabled={props.disabled}
          class="w-full rounded border border-black/20 bg-white px-2 py-1.5 text-sm text-text shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] outline-none transition-colors focus:border-accent disabled:opacity-50"
        >
          {props.children}
        </select>
      </label>
    </div>
  );
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

  const [ready, setReady] = createSignal(false);

  onMount(async () => {
    const [actionsMod, appMod, cmdMod, layoutMod, shapeMod] = await Promise.all(
      [
        import("../lib/mindmap/action.js"),
        import("../lib/mindmap/my-mind.js"),
        import("../lib/mindmap/command/command.js"),
        import("../lib/mindmap/layout/layout.js"),
        import("../lib/mindmap/shape/shape.js"),
      ],
    );
    actionsModule = actionsMod;
    appModule = appMod;
    commandRepo = cmdMod.repo;
    layoutRepo = layoutMod.repo;
    shapeRepo = shapeMod.repo;

    setReady(true);
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

  function setLayout(e) {
    const item = currentItem();
    if (!item) {
      return;
    }
    const layout = layoutRepo.get(e.target.value);
    appModule.action(new actionsModule.SetLayout(item, layout));
    e.target.blur(); // return focus to the canvas so shortcuts keep working
  }

  function setShape(e) {
    const item = currentItem();
    if (!item) {
      return;
    }
    const shape = shapeRepo.get(e.target.value);
    appModule.action(new actionsModule.SetShape(item, shape));
    e.target.blur();
  }

  function setValue(e) {
    const item = currentItem();
    if (!item) {
      return;
    }
    const raw = e.target.value;
    if (raw === "num") {
      // Same prompt()-based flow as the "value" keyboard shortcut/command.
      commandRepo.get("value").execute();
    } else {
      appModule.action(new actionsModule.SetValue(item, raw || null));
    }
    e.target.blur();
  }

  function setStatus(e) {
    const item = currentItem();
    if (!item) {
      return;
    }
    const raw = e.target.value;
    const status = raw in STATUS_MAP ? STATUS_MAP[raw] : raw;
    appModule.action(new actionsModule.SetStatus(item, status));
    e.target.blur();
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

  return (
    <div
      id="ui"
      class="fixed inset-y-0 right-0 z-5 flex overflow-hidden bg-pane shadow-card transition-[width] duration-300 ease-in-out"
      classList={{ "panel-expanded": !rightPanelHidden() }}
      style={{
        width: rightPanelHidden()
          ? "var(--ribbon-width)"
          : "var(--side-panel-width)",
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
          <Field
            label="Layout"
            value={layoutValue()}
            onChange={setLayout}
            disabled={!ready() || !currentItem()}
          >
            <option value="" disabled={isRoot()}>
              (Inherit)
            </option>
            {layoutGroups() && (
              <>
                <option value="map" disabled={!isRoot()}>
                  {layoutGroups().map.label}
                </option>
                <optgroup label="Graph">
                  <For each={layoutGroups().graph}>
                    {(l) => <option value={l.id}>{l.label}</option>}
                  </For>
                </optgroup>
                <optgroup label="Tree">
                  <For each={layoutGroups().tree}>
                    {(l) => <option value={l.id}>{l.label}</option>}
                  </For>
                </optgroup>
              </>
            )}
          </Field>

          <Field
            label="Shape"
            value={shapeValue()}
            onChange={setShape}
            disabled={!ready() || !currentItem()}
          >
            <option value="">(Automatic)</option>
            <For each={shapeList()}>
              {(s) => <option value={s.id}>{s.label}</option>}
            </For>
          </Field>

          <Field
            label="Value"
            value={valueValue()}
            onChange={setValue}
            disabled={!ready() || !currentItem()}
          >
            <option value="">(None)</option>
            <option value="num">Number</option>
            <optgroup label="Formula">
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="min">Minimum</option>
              <option value="max">Maximum</option>
            </optgroup>
          </Field>

          <Field
            label="Status"
            value={statusValue()}
            onChange={setStatus}
            disabled={!ready() || !currentItem()}
          >
            <option value="">None</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="computed">Autocompute</option>
          </Field>

          <ColorPicker label="Item color" onClick={setColor} />
          <ColorPicker label="Text color" onClick={setTextColor} />
        </div>

        <footer class="flex min-h-[28px] flex-none items-end justify-between border-t border-black/10 px-3 py-1.5">
          <span id="save-status" class="pl-0.5 text-base text-text"></span>
        </footer>
      </div>

      <div class="flex w-[var(--ribbon-width)] flex-shrink-0 flex-col items-center gap-2 py-2">
        <button
          class="icon-btn"
          onClick={toggleRightPanel}
          title="Toggle sidebar"
        >
          <PanelRight size={20} />
        </button>
      </div>

      <div class="spinner" hidden>
        <div class="dot1"></div>
        <div class="dot2"></div>
      </div>
    </div>
  );
}
