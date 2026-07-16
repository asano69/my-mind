# Overview


## Rules

- データベースのマイグレーションはPocketBaseのWEB UIから行うのでマイグレーションコードを作成する必要はまったくない。
- 後方互換性は維持しなくてよい。
- When fixing bugs, add a failing regression test first.
- All errors are user-facing, so messages should be clear.
- Keep functions small and focused.
- Module files should re-export what's needed, hide implementation details.
- Don't persist changes to the database during drilling. Use the cache.
- Don't use timezones: dates are naive for a reason. Due dates etc. are more like the dates in a journal entry than precise points in time.

## Tech Stack

- backend: Go + PocketBase **v0.39+**
- frontend: solid.js + **tailwind v4**

## 計画

- backendは、PocketBase **v0.39+**をつかったものへ、frontendは、solid.js + **tailwind v4** をつかったものへ並行して書き換えている。
- バックエンドは、go-templateをつかったSSRアプリを前提にした構造から、Solid.jsをつかったSPAを前提にした構造に書き換えが必要の可能性がある。
- フロントエンドは、フレームワーク（solid.js）をつかったコードの書き換えもすすめている。
- Catalog.index関連は、go-templateでやっていたが本質機能ではないので現状リンク切れの状態でよい。
- 重複コード、未使用コードの削除を優先的に行う。



# Work in progress
# Mindmap Engine → Solid Reactive State: Migration Plan

詳細は、docs/mindmap-state-refactor.mdを参照

## Goal

Replace the hand-rolled reactivity in `frontend/src/lib/mindmap/` (manual
`update()` calls, the `pubsub.js` event bus, and the `init()`/`dispose()`
lifecycle pattern in `ui/*.js`) with Solid's `createSignal` / `createStore`
/ `createEffect`, one module at a time, without a big-bang rewrite.

## Non-goals

- No behavior changes. Every step should be a pure refactor; if a step
  changes what the user sees or how a shortcut behaves, split it further.
- No backward compatibility shims beyond the migration window itself
  (per CLAUDE.md, backward compatibility is not a project requirement).
- Not attempting to convert the SVG layout math (`layout/*.js`) into
  declarative JSX. That stays imperative; only the *data* driving it
  becomes reactive (see Phase 6).

### Phase 9 progress note (revised)

Step 1 ("delete pubsub.js if no longer needed") was originally deferred
wholesale, citing live publishers/subscribers for six events. Re-auditing
those six shows they don't share one difficulty level — three are dead
code or unnecessary indirection, one is a direct pattern reuse, and only
one is a genuine signal-design decision. Sub-phased below instead of
treated as a single blocked item.

Steps 2–4 (item.js's `update()`, my-mind.js's dispose chain, help.js's
bridge move into HelpPanel.jsx) are unchanged from the original note.

---

## Phase 9.1 — Audit and remove dead events

Target: `command-sibling`, `command-child`.

`command/command.js`'s `InsertSibling`/`InsertChild` still call
`pubsub.publish("command-sibling")` / `pubsub.publish("command-child")`,
but no `pubsub.subscribe("command-sibling", ...)` or
`pubsub.subscribe("command-child", ...)` call site is present anywhere
in `frontend/src/`. These may be dead instrumentation left over from an
earlier UI (possibly the old iframe-based notes editor, before the
Solid rewrite).

Steps:
1. `grep -rn 'command-sibling\|command-child' frontend/src` to confirm
   zero subscribers.
2. If confirmed dead: delete both `pubsub.publish(...)` calls from
   `command/command.js`. If a subscriber turns up that wasn't visible
   in this review, treat it as a Phase 4-style one-off event and leave
   it — do not force it into a signal just to hit this checklist.

Risk: none beyond the audit itself — deleting an unsubscribed publish
call cannot change behavior.

---

## Phase 9.2 — Collapse same-module self-loops

Target: `load-done`.

`ui/io.js`'s `restore()` calls `pubsub.publish("load-done")`, and the
*only* subscriber is `ui/io.js`'s own `init()`:
`pubsub.subscribe("load-done", () => hide())`. This is a same-module
round trip through the event bus for no reason — nothing outside
`io.js` observes it.

Steps:
1. In `restore()`, replace `pubsub.publish("load-done")` with a direct
   `hide()` call.
2. Delete the `pubsub.subscribe("load-done", ...)` line from `init()`.
3. Delete the now-unused `import * as pubsub from "../pubsub.js"` line
   from `io.js` *only if* `item-change`'s Phase 9.5 hasn't landed yet
   requiring it — check `item-change` usage in the same file first, since
   `io.js` also subscribes to that.

Risk: none. `hide()` was always called synchronously in the same tick
as the publish; replacing indirection with a direct call cannot reorder
anything observable.

---

## Phase 9.3 — Direct call for map-new

Target: `map-new`.

`command/command.js`'s `New` command calls
`pubsub.publish("map-new")` after `app.showMap(new MindMap())`. The
only subscriber is `ui/io.js`'s `init()`:
`pubsub.subscribe("map-new", (_) => setCurrentMap(null))`. Crucially,
`command/command.js` already has `import * as io from "../ui/io.js"`
for other calls (`io.quickSave()`, `io.show()`, etc.), so there is no
new coupling introduced by calling `io.js` directly here — the coupling
already exists.

Steps:
1. Export a small `resetCurrentMap()` from `io.js` that does what the
   `setCurrentMap(null)` subscriber currently does (`setCurrentMap` is
   already a private helper in `io.js`; wrap it, don't export the
   private helper itself).
2. In `command/command.js`'s `New.execute()`, replace
   `pubsub.publish("map-new")` with `io.resetCurrentMap()`.
3. Delete the `pubsub.subscribe("map-new", ...)` line from `io.js`'s
   `init()`.

Risk: low. Same synchronous-call-order argument as Phase 9.2.

---

## Phase 9.4 — ui-change via the Phase 1 bridge pattern

Target: `ui-change`.

`ui/ui.js`'s `toggle()` (`#ui` panel show/hide) does
`node.hidden = !node.hidden; pubsub.publish("ui-change");`, and the
only subscriber is `my-mind.js`'s `handleResize` (triggered on
`ui-change` to recompute canvas width against the now-different panel
width). `ui/ui.js` still grabs `#ui` via
`document.querySelector("#ui")` and mutates `.hidden` directly, even
though `PropertyPanel.jsx` (the component that renders `#ui`) already
exists as a Solid component — this is exactly the "vanilla module holds
a DOM node Solid also renders" situation Phase 1 solved for `#help` via
`registerToggle`.

Steps:
1. Add a `hidden` signal to `PropertyPanel.jsx`, analogous to
   `HelpPanel.jsx`'s. Render `<div id="ui" class="pane" hidden={hidden()}>`
   instead of the current bare `hidden` attribute.
2. On mount, `PropertyPanel.jsx` calls a new `ui.registerToggle({ toggle,
   getHidden })` (same shape as `help.js`'s bridge, in `ui/ui.js` itself
   this time rather than a separate module — `ui/ui.js` is small enough
   not to need a dedicated `help.js`-style file split).
3. `ui/ui.js`'s `toggle()` becomes `toggleAPI?.toggle()`; `getWidth()`
   (used by `handleResize`) reads `toggleAPI?.getHidden() ? 0 :
   node.offsetWidth` — still needs `node.offsetWidth` for the *visible*
   width measurement, so `document.querySelector("#ui")` stays for that
   one read, but the hide/show state itself is now Solid-owned.
4. Replace `pubsub.publish("ui-change")` with a direct call:
   `ui/ui.js`'s `toggle()` (the bridge-forwarding one) calls
   `handleResize()` itself, since `ui.js` already has no dependency
   issue calling back into `my-mind.js` — check for an import cycle
   first; if one exists, keep `handleResize` as a small callback passed
   into `ui.init(port, onUIChange)` instead of a pubsub message, same
   spirit as Phase 4 step 4's "just become plain callbacks" fallback.
5. Delete the `pubsub.subscribe("ui-change", handleResize)` line and
   the `pubsub.publish("ui-change")` call.

Risk: medium. `getWidth()` is read synchronously by `handleResize` on
window resize, so the Solid `hidden` signal write and the next
`getWidth()` read must not straddle a Solid render tick in a way that
reads stale `offsetWidth`. Add a regression check: toggle the property
panel, resize the window immediately after (no intervening interaction),
confirm the canvas width recalculates against the *new* panel state, not
the previous one.

---

## Phase 9.5 — item-change as a dirty-version signal

Target: `item-change`.

This is the one Phase 4 deliberately deferred to "once `item.js` itself
is reactive" — that precondition (Phase 6) is now satisfied. Two
current subscribers: `ui/io.js`'s auto-save debounce
(`pubsub.subscribe("item-change", () => { ... setTimeout(saveMap) })`)
and `ui/notes.js`'s `onEditorChange` (which publishes, not subscribes —
it's a producer only, triggering auto-save via the same event).
Publishers: `map.js`'s `layoutSubtree()` (once per item, per layout
pass — the known Phase 8 "recomputes on every change everywhere" cost)
and `notes.js`'s `onEditorChange`.

The awkward part is exactly the thing Phase 8 flagged as a follow-up:
`layoutSubtree()` publishes once *per item* in the tree on every
recompute, not once per actual edit. A naive 1:1 signal replacement
would bump a version counter N times (N = tree size) for a single
character typed, which is harmless for a debounced auto-save (a signal
write during an existing debounce window is a no-op either way) but
worth calling out so nobody "fixes" it into per-item granularity later
under the mistaken impression that's an improvement — the auto-save
consumer only cares about "did anything change", not "what changed".

Steps:
1. Add `export const [dirtyVersion, bumpDirty] = createSignal(0)` — or
   simpler, a plain counter mutated via a setter, since nothing reads
   the *value*, only reacts to it changing — to `store.js`, grouped with
   `lastSaveTime` (same "save-status" concern, per the Phase 5
   addendum's store-scoping rule).
2. `map.js`'s `layoutSubtree()`: replace
   `pubsub.publish("item-change", item)` with a call to `bumpDirty()`.
   Since `layoutSubtree` already runs inside `map.js`'s
   `createComputed`, calling a signal setter from inside another
   signal's computed needs `batch()` or must happen outside the
   tracked scope — wrap the whole `layoutSubtree(this._root)` call
   already present in the computed with a single `bumpDirty()` call
   *after* the loop finishes, not once per item, since the per-item
   granularity was never meaningful to begin with (see above). This
   also fixes the N-bumps-per-pass issue as a side effect rather than
   preserving it.
3. `notes.js`'s `onEditorChange`: replace
   `pubsub.publish("item-change", app.currentItem)` with `bumpDirty()`
   imported from `store.js`.
4. `ui/io.js`: replace the `pubsub.subscribe("item-change", () => {...})`
   registration in `init()` with a `createRoot`+`createEffect` pair
   (same pattern as `title.js`, per the Phase 5 addendum's "vanilla
   module effects need `createRoot`" rule) that reads `dirtyVersion()`
   and runs the existing debounce-then-`saveMap()` body. Store the
   returned `dispose` and call it from `io.js`'s `dispose()`.
5. Delete the `import * as pubsub` lines from `map.js` and `notes.js`
   if nothing else in those files still uses `pubsub` (check first —
   `notes.js` currently only used it for this one publish, so it likely
   drops out entirely there; `map.js` likely also drops out, since
   `item.js` already lost its own `pubsub` import in this same
   cleanup pass).

Risk: medium-high, matching Phase 6/8's risk level for the same reason
(touches the shared layout computed). Regression checklist: type a
character, confirm auto-save still fires ~1s later exactly once;
undo/redo a batch of changes, confirm auto-save doesn't fire once per
undone step; edit notes text, confirm auto-save still triggers via the
`notes.js` path independent of the `map.js` path.


9.5だけは設計判断が必要です。 特に「木全体の再計算1回につき何回signalをbumpするか」という点で、素朴に1:1変換するとlayoutSubtreeのツリーサイズ分bumpされてしまいます（Phase 8で既知の全体再計算コストがここにも波及する形）。
上の案では「ループの外で1回だけbump」という設計にして、この機会にPhase 8の既知課題も一部緩和する形にしていますが、これは元のイベントの挙動を厳密に1:1で置き換えるものではない（意図的な改善を含む）。これで良い。


### Phase 9.5 progress note

Two consumers, two different fates:

- `io.js`'s auto-save debounce only ever needed "did anything change",
  so it moved to `store.js`'s coarse `dirtyVersion` signal, bumped once
  per `map.js` layout pass (not once per item — the deliberate
  coarsening the user approved, trading strict 1:1 event parity for
  fixing part of Phase 8's known "recomputes the whole tree" cost at
  the source). The subscription itself became a `createRoot` +
  `createEffect(on(dirtyVersion, ..., { defer: true }))` pair in
  `io.js`, disposed alongside the module's other state in `dispose()`.
  `{ defer: true }` matters here: without it the effect's first run at
  `init()` time would fire immediately (Solid effects run once on
  creation), unlike `pubsub.subscribe` which never fired until an
  actual publish. Skipping the initial run keeps the semantics
  equivalent rather than relying on `currentMapId` happening to be null
  at every `init()` call site.
- `PropertyPanel.jsx`'s subscription turned out to be dead weight
  already, independent of this phase. It existed to catch "did *this
  specific* item's properties change" by filtering
  `publisher === currentItem()`, but since Phase 6 made `item.layout`/
  `item.shape`/`item.value`/`item.status`/`item.isRoot` real per-item
  signals, the four `createMemo`s already tracked those signals
  directly the moment they read `item.layout.id` etc. — Solid's
  fine-grained tracking already did exactly what the manual `tick()`
  counter was reconstructing by hand, just more precisely (it also
  fires on shape/value/status specifically, not "some item-change
  event fired for this item"). Removed the `tick` signal and the
  subscription entirely, matching how Phase 9.1 also found a live
  `pubsub` call site whose subscriber no longer existed.

`notes.js`'s explicit `bumpDirty()` call was kept even though it's
provably redundant post-map.js-change (writing `item.notes` is a
signal write that `map.js`'s shared computed already depends on via
`updateNotes()`, so it already reruns and bumps dirty on its own).
Removing it would save nothing at runtime and would make `notes.js`'s
connection to auto-save invisible without tracing the reactive graph
across modules — kept for local readability over strict non-redundancy.

Regression checklist run: typing a character still triggers exactly one
debounced save ~1s later; undoing/redoing a batch of changes still
triggers the debounce (each undo/redo mutates signals, so each still
causes one `map.js` pass and one bump — no change from before, since
the old code also republished once per pass, just per-item within it);
editing notes text still triggers auto-save via `notes.js`'s explicit
call.

After this phase, `pubsub.js` has exactly one remaining call site in
the whole codebase: `my-mind.js`'s `unmount()` calls `pubsub.reset()`.
Every subscribe/publish pair is gone. Phase 9.6 (delete `pubsub.js`) is
now close to mechanical.

---

## Phase 9.6 — Delete pubsub.js

Precondition: Phases 9.1–9.5 all landed and verified independently (not
as one combined PR — same "land and verify before starting the next"
rule as the top-level phase table).

Steps:
1. `grep -rn 'pubsub' frontend/src` — should now show zero remaining
   `import * as pubsub` / `subscribe` / `publish` call sites, and zero
   references outside `pubsub.js` and `pubsub.test.js` themselves.
2. Delete `frontend/src/lib/mindmap/pubsub.js`.
3. Delete `frontend/src/lib/mindmap/pubsub.test.js` — its regression
   target (`my-mind.js`'s remount not double-subscribing) no longer
   applies once nothing subscribes to pubsub at all; the underlying
   remount-safety concern is now covered by whatever each Phase 9.1–9.5
   replacement uses instead (signal identity survives remounts by
   construction; `createRoot`-based effects are explicitly disposed in
   `dispose()`).
4. Remove `pubsub.reset()` from `my-mind.js`'s `unmount()` (currently
   called alongside `history.reset()`).

Risk: none beyond what 9.1–9.5 already carried — this step is pure
dead-code removal once its precondition holds.

### Phase 9.6 progress note

Confirmed zero remaining `pubsub` references across every file reviewed
in this migration (command.js, map.js, notes.js, io.js, ui.js,
PropertyPanel.jsx, item.js already cleaned in 9.1–9.5 and the earlier
Phase 9 `update()` removal; mouse.js, keyboard.js, clipboard.js,
title.js, help.js, context-menu.js, action.js, store.js never used it).
The only remaining call site was `my-mind.js`'s `unmount()` calling
`pubsub.reset()` — removed, along with the `pubsub` import.

Deleted `pubsub.js` and `pubsub.test.js`. The remount-safety concern
`pubsub.test.js` characterized (a fresh closure re-subscribing without
unsubscribing the old one) no longer applies: nothing subscribes to
anything through an event bus anymore. Each Phase 9.1–9.5 replacement
carries its own remount safety by construction — Solid signals have no
subscribe/unsubscribe lifecycle to double up, and the two vanilla-module
`createRoot` effects that do exist (`io.js`'s auto-save, `title.js`'s
document-title sync) are explicitly disposed in each module's own
`dispose()`, called from `my-mind.js`'s `unmount()` same as before.

This closes out the redesigned pubsub-elimination plan (9.1–9.6) in
full. Update to the top-level Phase 9 step 1: no longer "kept as-is" —
`pubsub.js` is deleted.

---

## Revised order summary

| Phase | Target | Risk | Depends on |
|---|---|---|---|
| 9.1 | dead `command-sibling`/`command-child` | none | — |
| 9.2 | `load-done` self-loop | none | — |
| 9.3 | `map-new` direct call | low | — |
| 9.4 | `ui-change` bridge (reuse Phase 1 pattern) | medium | — |
| 9.5 | `item-change` dirty signal | medium-high | Phase 6, 8 |
| 9.6 | delete `pubsub.js` | none | 9.1–9.5 |
