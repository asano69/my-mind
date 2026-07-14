#!/usr/bin/env bash
#
# migrate-layout.sh
#
# Reorganizes the repo from the current flat src/ + static/ layout into:
#
#   frontend/src/          <- src/            (TypeScript, built by Vite)
#   frontend/public/       <- static/ (css, img, vendor JS, favicon)
#   internal/handler/templates/  <- static/*.html (Go html/template sources)
#   internal/handler/dist/       <- (left empty; Vite build output, gitignored)
#
# Uses `git mv` so history is preserved. Safe to re-run: skips anything
# that no longer exists at the old path (already moved) and anything
# that already exists at the new path.
#
# Run from the repo root:
#   bash scripts/migrate-layout.sh

set -euo pipefail

if [ ! -d .git ]; then
  echo "Error: run this from the repository root (no .git found here)." >&2
  exit 1
fi

# move <src> <dst>
# Wraps `git mv`, skipping cleanly if src is missing or dst already exists.
move() {
  local src="$1" dst="$2"
  if [ ! -e "$src" ]; then
    echo "skip (missing): $src"
    return
  fi
  if [ -e "$dst" ]; then
    echo "skip (already exists): $dst"
    return
  fi
  mkdir -p "$(dirname "$dst")"
  git mv "$src" "$dst"
  echo "moved: $src -> $dst"
}

echo "== 1. Frontend TypeScript source =="
move src frontend/src

echo
echo "== 2. Go html/template sources =="
move static/base.html internal/handler/templates/base.html
move static/index.html internal/handler/templates/index.html
move static/catalog.html internal/handler/templates/catalog.html
move static/editor.html internal/handler/templates/editor.html

echo
echo "== 3. Static assets served as-is (Vite publicDir) =="
move static/theme.css frontend/public/theme.css
move static/catalog.css frontend/public/catalog.css
move static/editor.css frontend/public/editor.css
move static/my-mind.css frontend/public/my-mind.css
move static/easymde.min.js frontend/public/easymde.min.js
move static/easymde.min.css frontend/public/easymde.min.css
move static/img frontend/public/img
move static/favicon.ico frontend/public/favicon.ico
move static/shell.nix frontend/public/shell.nix

echo
echo "== 4. Drop hand-maintained duplicate (now a Vite build output) =="
if [ -e static/toast.js ]; then
  git rm static/toast.js
  echo "removed: static/toast.js (superseded by frontend build -> internal/handler/dist/toast.js)"
else
  echo "skip (missing): static/toast.js"
fi

echo
echo "== 5. Scaffold remaining empty dirs =="
mkdir -p internal/handler/dist
touch internal/handler/dist/.gitkeep
git add internal/handler/dist/.gitkeep

echo
echo "== 6. Leftover check =="
if [ -d static ]; then
  remaining="$(find static -mindepth 1 2>/dev/null || true)"
  if [ -n "$remaining" ]; then
    echo "NOTE: static/ still contains unmigrated files:"
    echo "$remaining"
  else
    rmdir static 2>/dev/null || true
    echo "static/ is now empty and was removed."
  fi
fi

cat <<'EOF'

Done. Remaining manual steps:
  - Add to .gitignore: frontend/node_modules, internal/handler/dist/*.js, internal/handler/dist/*.css
    (keep internal/handler/dist/.gitkeep tracked)
  - Create frontend/package.json, frontend/tsconfig.json, frontend/vite.config.ts
  - Update internal/handler/handler.go to use go:embed against
    internal/handler/templates and internal/handler/dist
  - Update .air.toml / Makefile build commands
EOF
