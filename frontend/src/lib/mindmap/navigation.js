// navigation.js — shared bridge letting vanilla modules (item.js, the
// old engine; newMouse.js's handleItemLinkClick, the new engine) perform
// an in-app, client-side navigation for same-origin link clicks, without
// either engine depending on @solidjs/router directly or duplicating
// this bridge itself. Workspace.jsx (the nearest ancestor rendered
// inside <Router>) registers the real navigate() function once on
// mount; everything else just calls navigateTo().
let navigateFn = null;

export function registerNavigate(fn) {
  navigateFn = fn;
}

// Returns true if a navigate() function was available and was called;
// false if nothing is registered yet (e.g. router not mounted), so the
// caller can fall back to a normal same-tab navigation.
export function navigateTo(path) {
  if (!navigateFn) {
    return false;
  }
  navigateFn(path);
  return true;
}
