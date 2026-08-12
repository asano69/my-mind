// urlUtils.js — small, dependency-free URL helpers shared by item.js
// (the old engine) and newEdit.js (the ?newEngine=1 preview's Phase 4.5
// editing integration, see docs/08-mindmap-engine-refactor.md), so both
// can detect "pasted text is a URL and nothing else" without either one
// pulling in the other's module graph.
const URL_ONLY_RE = /^https?:\/\/\S+$/i;

export function isUrlOnly(str) {
  return URL_ONLY_RE.test(str.trim());
}
