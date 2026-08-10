// Plain text field for an item's `url` (opened via the 🔗 icon appended
// to its label, see item.js's updateLink()). Committed on blur/Enter,
// not on every keystroke, so typing never spams the undo stack with
// SetUrl actions -- same pattern TopBar.jsx uses for title editing.
export default function UrlField(props) {
  return (
    <div class="border-b border-black/[0.07] px-3 py-2">
      <label class="block">
        <span class="mb-1 block text-[11px] font-semibold tracking-wider text-text/70 uppercase">
          URL
        </span>
        <input
          type="text"
          value={props.value}
          onInput={(e) => props.onInput(e.target.value)}
          onBlur={props.onBlur}
          onKeyDown={props.onKeyDown}
          placeholder="http://"
          disabled={props.disabled}
          aria-invalid={props.invalid}
          class="mt-1 w-full rounded border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent"
          classList={{
            "border-pane-hover": !props.invalid,
            "border-[#cc0000]": props.invalid,
          }}
        />
      </label>
    </div>
  );
}
