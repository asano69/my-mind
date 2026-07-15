import { createSignal, onCleanup } from "solid-js";

const DEBOUNCE_MS = 300;

// Controlled search input. Keeps keystrokes local and only calls
// props.onSearch once typing settles, so the parent can drive a
// server-side query (see Catalog.jsx) instead of filtering in the client.
export default function Search(props) {
  const [value, setValue] = createSignal("");
  let timer;

  function onInput(e) {
    const next = e.target.value;
    setValue(next);
    clearTimeout(timer);
    timer = setTimeout(() => props.onSearch(next.trim()), DEBOUNCE_MS);
  }

  onCleanup(() => clearTimeout(timer));

  return (
    <input
      type="search"
      value={value()}
      onInput={onInput}
      placeholder="Search by title…"
      class="w-full rounded-md border border-pane-hover bg-pane px-3 py-2
        text-sm text-text placeholder:text-text/40 focus:border-accent
        focus:outline-none"
    />
  );
}
