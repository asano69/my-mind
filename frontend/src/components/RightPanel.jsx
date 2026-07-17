import { createMemo, createSignal, For, onMount } from "solid-js";
import { currentItem } from "../lib/mindmap/store";

import FilePlus from "lucide-solid/icons/file-plus";
import FolderOpen from "lucide-solid/icons/folder-open";
import CloudUpload from "lucide-solid/icons/cloud-upload";
import Images from "lucide-solid/icons/images";

const STATUS_MAP = { yes: true, no: false, "": null };

function statusToString(status) {
  for (let key in STATUS_MAP) {
    if (STATUS_MAP[key] === status) {
      return key;
    }
  }
  return String(status);
}

// The property panel (#ui) — layout/shape/value/status controls for the
// currently selected item, color pickers, the notes/menu toggle buttons,
// the save spinner, and the save-status footer.
//
// layout/shape/value/status used to be backed by ui/layout.js, ui/shape.js,
// ui/value.js, ui/status.js, each imperatively reading/writing a plain
// <select>. They're now controlled Solid components reading store.js's
// `currentItem` signal directly (see CLAUDE.md, Solid migration Phase 3).
// Color/text-color swatches were already handled here before Phase 3, since
// they only dispatch an action on click and never read engine state back.
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
  // Mirrors #ui's show/hide state as Solid state instead of ui.js
  // reaching into the DOM directly (replaces the old "ui-change" pubsub
  // message, see CLAUDE.md, Solid migration Phase 9.4). Same bridge
  // pattern as HelpPanel.jsx's `hidden` signal for #help.
  const [hidden, setHidden] = createSignal(false);

  onMount(async () => {
    const [actionsMod, appMod, cmdMod, layoutMod, shapeMod, uiMod] =
      await Promise.all([
        import("../lib/mindmap/action.js"),
        import("../lib/mindmap/my-mind.js"),
        import("../lib/mindmap/command/command.js"),

        import("../lib/mindmap/layout/layout.js"),
        import("../lib/mindmap/shape/shape.js"),
        import("../lib/mindmap/ui/ui.js"),
      ]);
    actionsModule = actionsMod;
    appModule = appMod;
    commandRepo = cmdMod.repo;

    layoutRepo = layoutMod.repo;
    shapeRepo = shapeMod.repo;

    uiMod.registerToggle({ toggle: () => setHidden((h) => !h) });

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
    <div id="ui" class="pane" hidden={hidden()}>
      <div class="scrollable">
        <p class="row">
          <button class="icon-btn" data-command="new" title="New">
            <FilePlus size={28} />
          </button>

          <button class="icon-btn" data-command="load" title="Open">
            <FolderOpen size={28} />
          </button>
          <button class="icon-btn" data-command="save" title="Save">
            <CloudUpload size={28} />
          </button>
          <button class="icon-btn" data-command="save-as" title="Save as">
            <Images size={28} />
          </button>
        </p>
        <p>
          <label>
            <span>Layout</span>
            <select
              id="layout"
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
            </select>
          </label>
        </p>
        <p>
          <label>
            <span>Shape</span>
            <select
              id="shape"
              value={shapeValue()}
              onChange={setShape}
              disabled={!ready() || !currentItem()}
            >
              <option value="">(Automatic)</option>
              <For each={shapeList()}>
                {(s) => <option value={s.id}>{s.label}</option>}
              </For>
            </select>
          </label>
        </p>
        <p>
          <label>
            <span>Value</span>
            <select
              id="value"
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
            </select>
          </label>
        </p>
        <p>
          <label>
            <span>Status</span>
            <select
              id="status"
              value={statusValue()}
              onChange={setStatus}
              disabled={!ready() || !currentItem()}
            >
              <option value="">None</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="computed">Autocompute</option>
            </select>
          </label>
        </p>
        <p>
          <label>
            <span>Item color</span>
            <span id="color" class="color-picker" onClick={setColor}>
              <a data-color="" title="Inherit" href="#"></a>
              <a
                data-color="#000"
                title="Black"
                href="#"
                style={{ "background-color": "#000" }}
              ></a>
              <a
                data-color="#d33"
                title="Red"
                href="#"
                style={{ "background-color": "#d33" }}
              ></a>
              <a
                data-color="#33d"
                title="Blue"
                href="#"
                style={{ "background-color": "#33d" }}
              ></a>
              <a
                data-color="#3d3"
                title="Green"
                href="#"
                style={{ "background-color": "#3d3" }}
              ></a>
              <a
                data-color="#d3d"
                title="Magenta"
                href="#"
                style={{ "background-color": "#d3d" }}
              ></a>
              <a
                data-color="#3dd"
                title="Cyan"
                href="#"
                style={{ "background-color": "#3dd" }}
              ></a>
              <a
                data-color="#dd3"
                title="Yellow"
                href="#"
                style={{ "background-color": "#dd3" }}
              ></a>
            </span>
          </label>
        </p>
        <p>
          <label>
            <span>Text color</span>
            <span id="text-color" class="color-picker" onClick={setTextColor}>
              <a data-color="" title="Inherit" href="#"></a>
              <a
                data-color="#000"
                title="Black"
                href="#"
                style={{ "background-color": "#000" }}
              ></a>
              <a
                data-color="#d33"
                title="Red"
                href="#"
                style={{ "background-color": "#d33" }}
              ></a>
              <a
                data-color="#33d"
                title="Blue"
                href="#"
                style={{ "background-color": "#33d" }}
              ></a>
              <a
                data-color="#3d3"
                title="Green"
                href="#"
                style={{ "background-color": "#3d3" }}
              ></a>
              <a
                data-color="#d3d"
                title="Magenta"
                href="#"
                style={{ "background-color": "#d3d" }}
              ></a>
              <a
                data-color="#3dd"
                title="Cyan"
                href="#"
                style={{ "background-color": "#3dd" }}
              ></a>
              <a
                data-color="#dd3"
                title="Yellow"
                href="#"
                style={{ "background-color": "#dd3" }}
              ></a>
            </span>
          </label>
        </p>
      </div>
      <footer>
        <span id="save-status"></span>
      </footer>

      <div class="spinner" hidden>
        <div class="dot1"></div>
        <div class="dot2"></div>
      </div>
    </div>
  );
}
