import { throbberVisible } from "../lib/mindmap/store";

// Reusable loading indicator (two bouncing dots, styled by my-mind.css's
// `.spinner`/`.dot1`/`.dot2` rules). Defaults to store.js's shared
// `throbberVisible` signal, so callers that just want "the app's global
// loading state" can drop this in with no props at all. Pass `visible`
// explicitly to control a locally-scoped loading state instead (e.g. a
// spinner for one specific async action, independent of the shared one).
export default function Spinner(props) {
  const isVisible = () =>
    props.visible !== undefined ? props.visible : throbberVisible();

  return (
    <div class="spinner" hidden={!isVisible()}>
      <div class="dot1"></div>
      <div class="dot2"></div>
    </div>
  );
}
