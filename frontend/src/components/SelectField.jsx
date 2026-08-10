import { createMemo } from "solid-js";
import { Select } from "@kobalte/core/select";

// Kobalte (and our own `selected` lookup below) treats an empty string
// as "no value selected", which broke every field whose default option
// is meant to be "" (Layout's "(Inherit)", Shape's "(Automatic)",
// Value's "(None)", Status's "None") -- the trigger showed nothing
// instead of that default label. Wrapping "" in a non-empty sentinel
// before handing options/value to Kobalte sidesteps that falsy check
// entirely; unwrapValue() converts back to "" at the two boundaries
// that talk to the caller (selected() and onChange).
const EMPTY_VALUE = "__select-field-empty__";
function wrapValue(value) {
  return value === "" ? EMPTY_VALUE : value;
}
function unwrapValue(value) {
  return value === EMPTY_VALUE ? "" : value;
}

// Recursively wraps every option's `value` (plain items and grouped
// items alike) so "" never reaches Kobalte directly. Leaf items nested
// under a group also get `grouped: true`, so itemComponent below can
// indent them under their group label -- Kobalte's Select.Section only
// renders the label itself, not a wrapping element around its items, so
// this is the simplest way to tell a grouped leaf apart from a top-level
// one without depending on Kobalte's internal DOM structure.
function wrapOptions(options, grouped = false) {
  return options.map((option) =>
    "options" in option
      ? { ...option, options: wrapOptions(option.options, true) }
      : { ...option, value: wrapValue(option.value), grouped },
  );
}

// Flattens a mix of plain option items ({ value, label, disabled }) and
// grouped items ({ label, options: [...] }) into a single list of plain
// items, used only to resolve the currently selected option object.
function flattenOptions(options) {
  return options.flatMap((option) =>
    "options" in option ? option.options : [option],
  );
}

// A labeled dropdown built on Kobalte's headless Select, replacing the
// native <select> the property panel used to render directly (see
// RightPanel.jsx). `options` accepts a mix of plain items and groups
// (`{ label, options: [...] }`), mirroring the shape the old
// <option>/<optgroup> markup expressed. `value`/`onChange` work with the
// plain string value (an option's `value`), not the raw option object,
// so callers don't need to know about Kobalte's own option-object model
// or the "" sentinel wrapping above.
export default function SelectField(props) {
  const kobalteOptions = createMemo(() => wrapOptions(props.options));

  const selected = createMemo(() => {
    const target = wrapValue(props.value);
    return (
      flattenOptions(kobalteOptions()).find((o) => o.value === target) ?? null
    );
  });

  return (
    <div class="border-b border-black/[0.07] px-3 py-2">
      <span class="mb-1 block text-[11px] font-semibold tracking-wider text-text/70 uppercase">
        {props.label}
      </span>
      <Select
        options={kobalteOptions()}
        optionValue="value"
        optionTextValue="label"
        optionDisabled="disabled"
        // Tells Kobalte which property on a group object holds its child
        // options, so it renders { label: "Graph", options: [...] } as a
        // real optgroup (via sectionComponent below) instead of trying to
        // treat the group object itself as a selectable leaf item.
        optionGroupChildren="options"
        value={selected()}
        onChange={(option) =>
          props.onChange(option ? unwrapValue(option.value) : "")
        }
        disabled={props.disabled}
        itemComponent={(itemProps) => (
          <Select.Item
            item={itemProps.item}
            class="cursor-pointer rounded py-1.5 pr-2 text-sm text-text outline-none data-[highlighted]:bg-hover data-[disabled]:cursor-default data-[disabled]:opacity-40"
            classList={{
              "pl-2": !itemProps.item.rawValue.grouped,
              "pl-5": itemProps.item.rawValue.grouped,
            }}
          >
            <Select.ItemLabel>{itemProps.item.rawValue.label}</Select.ItemLabel>
          </Select.Item>
        )}
        sectionComponent={(sectionProps) => (
          <Select.Section class="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-text/50 uppercase">
            {sectionProps.section.rawValue.label}
          </Select.Section>
        )}
      >
        <Select.Trigger class="flex w-full items-center rounded border border-pane-hover bg-bg px-2 py-1.5 text-sm text-text shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] outline-none transition-colors focus:border-accent disabled:opacity-50">
          <Select.Value class="truncate text-left">
            {(state) => state.selectedOption()?.label ?? ""}
          </Select.Value>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content class="z-20 rounded-md border border-pane-hover bg-pane shadow-card">
            <Select.Listbox class="max-h-64 overflow-y-auto p-1" />
          </Select.Content>
        </Select.Portal>
      </Select>
    </div>
  );
}
