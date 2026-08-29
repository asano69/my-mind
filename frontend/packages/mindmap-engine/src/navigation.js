// navigation.js — shared bridge letting vanilla modules (item.js, the
// old engine; newMouse.js's handleItemLinkClick, the new engine) perform
// an in-app, client-side navigation for same-origin link clicks, without
// either engine depending on @solidjs/router directly or duplicating
// this bridge itself. Workspace.jsx (the nearest ancestor rendered
// inside <Router>) sets the real navigate() function into the signal
// below once on mount; everything else just calls navigateTo().
//
// Exposes a plain Solid signal pair (navigate/setNavigate) instead of a
// registerNavigate()-style imperative setter -- per
// docs/mind-map-core-engine-library/02-plan.md, a Solid library reads
// more naturally when its state is a signal a consumer can plug into
// directly, rather than a bespoke "register a callback" function that
// looks like a hidden side effect from the outside.
//
// createNavigation() closes this signal into a per-instance factory, per
// docs/mind-map-core-engine-library/01-plan.md's Step 5 -- each
// createMindMap() instance gets its own independent navigate target.
import { createSignal } from "solid-js";

export function createNavigation() {
  const [navigate, setNavigate] = createSignal(null);

  // Returns true if a navigate() function was available and was called;
  // false if nothing has been set yet (e.g. router not mounted), so the
  // caller can fall back to a normal same-tab navigation.
  function navigateTo(path) {
    const fn = navigate();
    if (!fn) {
      return false;
    }
    fn(path);
    return true;
  }

  return { navigate, setNavigate, navigateTo };
}
