import { For } from "solid-js";
// A labeled row of clickable color swatches, used by
// RightPanelProperties.jsx for both the item-color and text-color
// pickers (props.onClick receives the raw click event, matching the
// delegation pattern the old .color-picker markup used).
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

export default function ColorPicker(props) {
  return (
    <div class="border-b border-black/[0.07] px-3 py-2">
      <label class="block">
        <span class="mb-1 block text-[11px] font-semibold tracking-wider text-text/70 uppercase">
          {props.label}
        </span>

        <span
          class="mt-1 flex flex-row flex-wrap gap-1"
          onClick={(e) => props.onClick(e)}
        >
          <For each={COLOR_SWATCHES}>
            {(c) => (
              <a
                data-color={c.value}
                title={c.title}
                href="#"
                class="h-4 w-4 rounded-[4px] shadow-[0_1px_4px_rgba(0,0,0,0.8)] transition-transform hover:scale-125"
                style={c.value ? { "background-color": c.value } : {}}
              />
            )}
          </For>
        </span>
      </label>
    </div>
  );
}
