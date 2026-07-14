#!/usr/bin/env bash
# reorganize-frontend.sh
#
# Cleans up the repo ahead of Solid.js SPA development. Two things only:
#
#   1. Removes files under internal/assets/ that are byte-for-byte
#      duplicates of files under frontend/public/ (theme.css, my-mind.css,
#      catalog.css, editor.css, easymde.min.css, easymde.min.js).
#      frontend/public/ becomes the single source of truth for these.
#
#   2. Moves the legacy Go-template SSR frontend (internal/assets/templates
#      + the compiled bundles those templates loaded: server.js, toast.js)
#      into docs/legacy-ssr-frontend/. This is reference material only —
#      nothing there is built, embedded, or served anymore. It's kept so
#      the old markup/behavior can be consulted while porting logic into
#      the new frontend/src Solid.js SPA.
#
# Deliberately NOT touched (separate follow-up work):
#   - internal/assets/assets.go and internal/assets/dist/ (the go:embed
#     target) — left alone so nothing currently building silently breaks.
#   - frontend/src/* — this is the actively developed (JS, mid-port-to-
#     Solid) app; not this script's concern.
#   - The Vite build output-path mismatch (vite.config.js writes to
#     internal/handler/dist, but assets.go embeds internal/assets/dist)
#     and frontend/index.html's missing src/main.jsx entry point.
#
# Safe to re-run: skips anything already moved or already gone.

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

legacy_dir="docs/legacy-ssr-frontend"
templates_src="internal/assets/templates"
legacy_templates_dst="$legacy_dir/templates"
legacy_static_dst="$legacy_dir/static"

is_tracked() {
  git ls-files --error-unmatch "$1" >/dev/null 2>&1
}

mv_tracked() {
  local src="$1" dst="$2"
  [ -e "$src" ] || return 0
  mkdir -p "$(dirname "$dst")"
  if is_tracked "$src"; then
    git mv -f "$src" "$dst"
  else
    mv -f "$src" "$dst"
  fi
  echo "moved:   $src -> $dst"
}

rm_dup() {
  local path="$1"
  [ -e "$path" ] || return 0
  if is_tracked "$path"; then
    git rm -q -f "$path"
  else
    rm -f "$path"
  fi
  echo "removed duplicate: $path"
}

echo "== 1/3: dropping internal/assets/* files identical to frontend/public/* =="
pairs="
internal/assets/theme.css:frontend/public/theme.css
internal/assets/my-mind.css:frontend/public/my-mind.css
internal/assets/catalog.css:frontend/public/catalog.css
internal/assets/editor.css:frontend/public/editor.css
internal/assets/easymde.min.css:frontend/public/easymde.min.css
internal/assets/easymde.min.js:frontend/public/easymde.min.js
"
while IFS=: read -r legacy_path canonical_path; do
  [ -n "$legacy_path" ] || continue
  if [ -e "$legacy_path" ] && [ -e "$canonical_path" ]; then
    if cmp -s "$legacy_path" "$canonical_path"; then
      rm_dup "$legacy_path"
    else
      echo "SKIP (content differs, check by hand): $legacy_path vs $canonical_path"
    fi
  fi
done <<<"$pairs"

echo
echo "== 2/3: moving legacy SSR templates + their compiled bundles into $legacy_dir =="
mkdir -p "$legacy_templates_dst" "$legacy_static_dst"

if [ -d "$templates_src" ]; then
  for f in "$templates_src"/*.html; do
    [ -e "$f" ] || continue
    mv_tracked "$f" "$legacy_templates_dst/$(basename "$f")"
  done
  rmdir "$templates_src" 2>/dev/null || true
fi

for f in internal/assets/server.js internal/assets/toast.js; do
  mv_tracked "$f" "$legacy_static_dst/$(basename "$f")"
done

echo
echo "== 3/3: writing $legacy_dir/README.md =="
mkdir -p "$legacy_dir"
cat >"$legacy_dir/README.md" <<'EOF'
# Legacy SSR frontend (reference only)

This is the old Go-template + hand-bundled-JS frontend that
`internal/assets` used to serve directly. It is **not built, not
`go:embed`-ded, and not served** by the app anymore.

It's kept purely so markup/behavior from the pre-Solid.js implementation
can be consulted while porting logic into the new Vite + Solid.js SPA in
`frontend/`.

- `templates/` — the Go `html/template` pages (base/index/editor/catalog).
- `static/` — the compiled JS bundles those templates loaded
  (`server.js`, `toast.js`). These are build *output*, not source; their
  actual source lives (in JS-ified, work-in-progress form) under
  `frontend/src/`.

Shared CSS/vendor files (`theme.css`, `my-mind.css`, `catalog.css`,
`editor.css`, `easymde.min.*`) were dropped from this tree entirely since
they were byte-identical to the copies in `frontend/public/`, which
remains the single source of truth for those assets.

Don't fix bugs here — fix the equivalent logic in `frontend/src/` instead.
EOF
git add "$legacy_dir/README.md" 2>/dev/null || true

echo
echo "Done. Known follow-ups this script deliberately leaves alone:"
echo "  - frontend/src/my-mind.ts is stale TypeScript left over from the"
echo "    TS -> JS revert (vite.config.js expects src/my-mind.js instead)."
echo "  - frontend/index.html references /src/main.jsx, which doesn't exist"
echo "    yet (the real Solid.js SPA entry point still needs writing)."
echo "  - vite.config.js outputs to internal/handler/dist, but"
echo "    internal/assets/assets.go embeds internal/assets/dist. Re-wiring"
echo "    the build pipeline is a separate step, done once you're ready."
