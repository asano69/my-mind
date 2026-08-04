import { throbberVisible } from "../lib/mindmap/store";

// Reusable loading indicator (two staggered bouncing dots). Styles are
// co-located in this file (Svelte-style embedded CSS) rather than a
// separate stylesheet, since nothing outside this component needs them.
// Tailwind utilities cover layout/color; the two keyframe animations
// (rotation, scale-bounce with a staggered delay) aren't expressible as
// core Tailwind utilities in this environment, so they're declared in a
// plain <style> tag scoped by this component's own class names.
//
// Defaults to store.js's shared `throbberVisible` signal, so callers
// that just want "the app's global loading state" can drop this in with
// no props at all. Pass `visible` explicitly to control a locally-scoped
// loading state instead (e.g. a spinner for one specific async action,
// independent of the shared one).
export default function Spinner(props) {
  const isVisible = () =>
    props.visible !== undefined ? props.visible : throbberVisible();

  // Positioning/sizing defaults to the canvas's floating placement, but
  // callers outside that context (e.g. Catalog.jsx's inline loading
  // state) can override via `class` to render in normal document flow.
  const positionClass = () =>
    props.class ?? "fixed top-[50px] right-[260px] z-[9999] h-10 w-10";

  return (
    <div class={`spinner ${positionClass()}`} hidden={!isVisible()}>
      <span class="dot1 absolute top-0 inline-block h-3/5 w-3/5 rounded-full bg-accent" />
      <span class="dot2 absolute bottom-0 inline-block h-3/5 w-3/5 rounded-full bg-accent" />
      <style>{`
        .spinner { animation: spinner-rotate 2s infinite linear; }
        .dot1, .dot2 { animation: spinner-bounce 2s infinite ease-in-out; }
        .dot2 { animation-delay: -1s; }
        @keyframes spinner-rotate {
          100% { transform: rotate(360deg); }
        }
        @keyframes spinner-bounce {
          0%, 100% { transform: scale(0); }
          50% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
