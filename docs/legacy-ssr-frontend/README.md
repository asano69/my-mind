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
