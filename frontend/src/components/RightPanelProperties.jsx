import { createEffect, createMemo, createSignal, onMount } from "solid-js";
import { openValueDialog } from "../lib/mindmap/store";
import { currentItem } from "../lib/mindmap/itemSelection";
import SelectField from "./SelectField";
import ColorPicker from "./ColorPicker";
import UrlField from "./UrlField";

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

const STATUS_MAP = { yes: true, no: false, "": null };

function statusToString(status) {
  for (let key in STATUS_MAP) {
    if (STATUS_MAP[key] === status) {
      return key;
    }
  }
  return String(status);
}

// Returns true only for a non-empty string that isn't http(s) -- used to
// block committing an obviously-wrong URL from the field below,
// mirroring ValueDialog.jsx's isInvalidInput() guard.
function isInvalidUrl(text) {
  return text.length > 0 && !/^https?:\/\//i.test(text);
}

// The property panel's per-item fields: Layout/Shape/Value/Status
// selects, the URL field, and the item/text color pickers. Split out of
// RightPanel.jsx since these all share the same "read/write the
// currently selected item" concern, independent of the panel's export
// actions or footer.
export default function RightPanelProperties() {
  // Cached after the first dynamic import, see onMount -- loaded lazily
  // so the engine bundle isn't pulled in before the canvas actually
  // mounts. actionsModule exposes the Set* action classes; dispatchAction
  // is the function that pushes an action onto history and runs it (both
  // live in newAction.js). There is no "value" command repo dependency
  // (see setValue() below): that command only ever opened store.js's
  // shared valueDialogOpen signal, which this component now does
  // directly.
  let actionsModule;
  let dispatchAction;
  let layoutRepo;
  let shapeRepo;

  const [ready, setReady] = createSignal(false);

  onMount(async () => {
    const [actionsMod, layoutMod, shapeMod] = await Promise.all([
      import("../lib/mindmap/newAction.js"),
      import("../lib/mindmap/layout/layout.js"),
      import("../lib/mindmap/shape/shape.js"),
    ]);
    actionsModule = actionsMod;
    dispatchAction = actionsMod.action;
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

  const isRoot = createMemo(() => !!currentItem()?.isRoot);

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

  // Local buffer for the URL field, separate from currentItem()?.url so
  // typing doesn't dispatch a SetUrl action (and clutter the undo stack)
  // on every keystroke -- only committed on blur/Enter (see commitUrl()).
  const [urlInput, setUrlInput] = createSignal("");
  createEffect(() => {
    setUrlInput(currentItem()?.url || "");
  });

  // Kobalte's Select trigger is a <button>, not a native <select>, so
  // there is no event target to blur directly here (unlike a plain
  // e.target.blur()). Blur whichever element is currently focused,
  // which is the trigger button right after a selection, so keyboard
  // shortcuts keep working the same way they did before this refactor.
  function returnFocusToCanvas() {
    document.activeElement?.blur();
  }

  function commitUrl() {
    const item = currentItem();
    if (!item) {
      return;
    }
    const raw = urlInput().trim();
    if (isInvalidUrl(raw)) {
      // Block the commit; the field shows an error state instead (see
      // isInvalidUrl() and the aria-invalid prop below).
      return;
    }
    if (raw === (item.url || "")) {
      returnFocusToCanvas();
      return;
    }
    dispatchAction(new actionsModule.SetUrl(item, raw));
    returnFocusToCanvas();
  }

  function setLayout(value) {
    const item = currentItem();
    if (!item) {
      return;
    }
    // Guard against Kobalte's Select firing onChange as a side effect of
    // its controlled `value` prop changing (e.g. when selection switches
    // to a different item whose layout differs from the previous one --
    // see layoutValue() above). Without this, merely selecting a
    // different node can silently push a spurious SetLayout action onto
    // the undo stack, clobbering the redo history. Skip when the
    // "change" is actually a no-op relative to the item's real state.
    const currentLayoutId = item.layout ? item.layout.id : "";
    if (currentLayoutId === value) {
      returnFocusToCanvas();
      return;
    }
    const layout = layoutRepo.get(value);
    dispatchAction(new actionsModule.SetLayout(item, layout));
    returnFocusToCanvas();
  }

  function setShape(value) {
    const item = currentItem();
    if (!item) {
      return;
    }
    // See setLayout()'s comment above -- same guard against Kobalte's
    // Select spuriously firing onChange on a controlled-value change.
    const currentShapeId = item.shape ? item.shape.id : "";
    if (currentShapeId === value) {
      returnFocusToCanvas();
      return;
    }
    const shape = shapeRepo.get(value);
    dispatchAction(new actionsModule.SetShape(item, shape));
    returnFocusToCanvas();
  }

  function setValue(value) {
    const item = currentItem();
    if (!item) {
      return;
    }
    if (value === "num") {
      // Opens the Kobalte-based ValueDialog directly via store.js's
      // shared signal, rather than routing through command/command.js's
      // "value" command -- that command repo is old-engine-only (its
      // Command class reads app.editing/app.currentItem), while
      // valueDialogOpen/ValueDialog.jsx are already shared by both
      // engines. Always allowed to reopen (even if the item is already
      // numeric), since opening the dialog has no history side effect.
      openValueDialog();
      returnFocusToCanvas();
      return;
    }
    // See setLayout()'s comment above. Mirrors valueValue()'s own
    // formatting so the comparison matches what's actually displayed.
    const v = item.value;
    const currentDisplay = v === null ? "" : typeof v === "number" ? "num" : v;
    if (currentDisplay === value) {
      returnFocusToCanvas();
      return;
    }
    dispatchAction(new actionsModule.SetValue(item, value || null));
    returnFocusToCanvas();
  }

  function setStatus(value) {
    const item = currentItem();
    if (!item) {
      return;
    }
    // See setLayout()'s comment above.
    if (statusToString(item.status) === value) {
      returnFocusToCanvas();
      return;
    }
    const status = value in STATUS_MAP ? STATUS_MAP[value] : value;
    dispatchAction(new actionsModule.SetStatus(item, status));
    returnFocusToCanvas();
  }

  function setColor(e) {
    e.preventDefault();
    const color = e.target.dataset.color;
    const item = currentItem();
    if (color === undefined || !item || !actionsModule) {
      return;
    }
    dispatchAction(new actionsModule.SetColor(item, color));
  }

  function setTextColor(e) {
    e.preventDefault();
    const color = e.target.dataset.color;
    const item = currentItem();
    if (color === undefined || !item || !actionsModule) {
      return;
    }
    dispatchAction(new actionsModule.SetTextColor(item, color));
  }

  return (
    <>
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

      <UrlField
        value={urlInput()}
        onInput={setUrlInput}
        onBlur={commitUrl}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        invalid={isInvalidUrl(urlInput())}
        disabled={!ready() || !currentItem()}
      />

      <ColorPicker label="Item color" onClick={setColor} />
      <ColorPicker label="Text color" onClick={setTextColor} />
    </>
  );
}
