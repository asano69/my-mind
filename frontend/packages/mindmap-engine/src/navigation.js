// navigation.js — shared bridge letting vanilla modules (item.js, the
// old engine; newMouse.js's handleItemLinkClick, the new engine) perform
// an in-app, client-side navigation for same-origin link clicks, without
// either engine depending on @solidjs/router directly or duplicating
// this bridge itself. Workspace.jsx (the nearest ancestor rendered
// inside <Router>) registers the real navigate() function once on
// mount; everything else just calls navigateTo().
//
// createNavigation() closes the single `navigateFn` slot into a
// per-instance factory, per docs/mind-map-core-engine-library/01-plan.md's
// Step 5 -- the module-level default instance further down preserves
// every existing call site unchanged during the migration.
export function createNavigation() {
  let navigateFn = null;

  function registerNavigate(fn) {
    navigateFn = fn;
  }

  // Returns true if a navigate() function was available and was called;
  // false if nothing is registered yet (e.g. router not mounted), so the
  // caller can fall back to a normal same-tab navigation.
  function navigateTo(path) {
    if (!navigateFn) {
      return false;
    }
    navigateFn(path);
    return true;
  }

  return { registerNavigate, navigateTo };
}
