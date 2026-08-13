// urlUtils.js — small, dependency-free URL helpers shared by item.js
// (the old engine) and newEdit.js/NewMindMapPreview.jsx (the
// ?newEngine=1 preview's editing/link integration, see
// docs/08-mindmap-engine-refactor.md), so both engines can detect
// "pasted text is a URL and nothing else" and "does this URL point at
// the same origin as the current page" without either one pulling in
// the other's module graph.
const URL_ONLY_RE = /^https?:\/\/\S+$/i;

export function isUrlOnly(str) {
  return URL_ONLY_RE.test(str.trim());
}

// Whether `url` resolves to the same origin as the current page. Used
// by the link-open click handler (see item.js's dom.link listener and
// NewMindMapPreview.jsx's handleItemLinkClick) to decide SPA-navigate-
// in-place vs. new-tab. Falls back to false (treat as external) for
// anything that fails to parse as a URL, so a malformed value never
// throws.
export function isSameOrigin(url) {
  try {
    return (
      new URL(url, window.location.href).origin === window.location.origin
    );
  } catch {
    return false;
  }
}
