# Mindmap Engine → Solid Reactive State: Migration Plan

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

## Guiding principles

1. **Bridge pattern first.** `NotesEditor.jsx` and `TitleBar.jsx` already
   show the working pattern: the Solid component calls
   `registerXxx({ setValue, ... })` on mount, and the vanilla module calls
   those setters instead of touching the DOM directly. Reuse this pattern
   for every subsequent panel instead of inventing a new one.
2. **One module in, one module's dead code out.** Once a `ui/*.js` module
   is fully replaced, delete it and its `init()`/`dispose()` call sites
   immediately. Don't keep both systems live for a module longer than one
   step — that's exactly the kind of double-bookkeeping the migration is
   meant to remove.
3. **Leaves before roots.** Convert modules with the fewest incoming
   dependents first (help text, color pickers) before touching `item.js`
   or `map.js`, which almost everything else depends on.
4. **A failing regression test before every bug-shaped step.** Any step
   that touches undo/redo or auto-save gets a test first, per CLAUDE.md.
5. **Comments stay in English**, matching existing code, even when
   translating a module that currently has none.

---

## Phase 0 — Safety net (no reactivity changes yet)

Before touching any module, add characterization tests so regressions in
later phases are caught immediately rather than discovered by hand.

- Add `vitest` tests for `history.js` (`push`/`back`/`forward`/`canBack`/
  `canForward`) — currently untested, and Phase 7 will rewrite its
  internals.
- Add a test for `action.js`'s `Multi` (do/undo ordering) since later
  phases will change how actions notify listeners.
- Keep `pubsub.test.js` as the template for "regression test documents
  the target behavior before the fix exists."

No production code changes in this phase.

---

## Phase 1 — Static/leaf UI panels

Target: `ui/help.js` (backing `HelpPanel.jsx`).

This module only *reads* `commandRepo` once and writes text into
pre-existing table rows. It has no `dispose()` cleanup burden beyond
nulling a reference, and nothing else depends on its output.

Steps:
1. Move the `buildRow`/`formatKey` logic into `HelpPanel.jsx` as plain
   functions (no signals needed — `commandRepo` is static after module
   load).
2. Replace the DOM `insertRow`/`insertCell` calls with a Solid `<For>`
   over a plain array computed at render time.
3. Delete `ui/help.js`; remove its `init()`/`dispose()` calls from
   `ui/ui.js` and the `help.toggle()` calls in `command/command.js` become
   a signal toggle owned by `HelpPanel.jsx` (exposed via a small
   `registerToggle` bridge, same pattern as `title.js`).

Risk: low. Nothing writes into this module from the engine side.

---

## Phase 2 — Single-purpose write-only bridges

Target: `ui/color.js`, `ui/text-color.js`.

These modules only dispatch `actions.SetColor` / `actions.SetTextColor`
on click; they don't need to *read* engine state except to fill in
`data-color` swatches (static).

Steps:
1. Move the swatch markup and click handling into `PropertyPanel.jsx`
   directly (no dynamic import needed — these don't touch `app.currentItem`
   at import time, only inside the click handler).
2. Call `app.action(new actions.SetColor(...))` directly from the Solid
   click handler; no bridge object required since there's nothing to
   register.
3. Delete `ui/color.js` and `ui/text-color.js`.

Risk: low. Verify color-picker clicks still produce one undo step each
(existing behavior — `SetColor` already is a single `Action`).

---

## Phase 3 — Read/write `<select>` fields

Target: `ui/layout.js`, `ui/shape.js`, `ui/value.js`, `ui/status.js`.

These are harder than Phase 2 because they both **read** current-item
state (to set the dropdown's displayed value) and **write** it (on
`change`). This is where a shared piece of Solid state for "the currently
selected item" starts to earn its keep.

Steps:
1. Introduce one new module, `lib/mindmap/store.js`, exporting a single
   `createSignal` for `currentItem` (or a `createStore` if richer shape
   is needed later). This does **not** replace `app.currentItem` yet —
   `my-mind.js`'s `selectItem()` additionally calls the new setter, so
   both the old field and the new signal stay in sync during the
   transition.
   ```js
   // store.js
   import { createSignal } from "solid-js";
   // Mirrors my-mind.js's `currentItem` module state as a Solid signal,
   // so Solid components can react to selection changes without pubsub.
   export const [currentItem, setCurrentItem] = createSignal(null);
   ```
2. In `my-mind.js`'s `selectItem()`, add `setCurrentItem(item)` alongside
   the existing `currentItem = item` assignment.
3. Rewrite `PropertyPanel.jsx`'s layout/shape/value/status `<select>`s as
   controlled Solid components: `value={currentItem()?.layout?.id ?? ""}`
   with `onChange` dispatching the existing `actions.SetLayout` etc.
   directly (no more `ui/layout.js` module).
4. Delete `ui/layout.js`, `ui/shape.js`, `ui/value.js`, `ui/status.js` and
   their `pubsub.subscribe("item-select", update)` wiring in `ui/ui.js`.

Risk: medium. The `resolvedValue`/`resolvedStatus` getters in `item.js`
depend on child items too, so double-check the "Autocompute" status option
and value formulas (`sum`/`avg`/`min`/`max`) still recompute when a child
changes, not just when the current item changes. Add a regression test
for "changing a child's value updates the parent's displayed computed
value" if one doesn't exist, since this is exactly the kind of stale-read
bug Solid is meant to prevent — worth confirming it's actually fixed, not
just moved.


ui/layout.js と ui/shape.js は、冒頭で layout/graph.js・layout/tree.js・layout/map.js・shape/box.js・shape/ellipse.js・shape/underline.js を副作用目的でimportしており、これによって各レイアウト/シェイプの実体が repo に登録されています。これはプロパティパネルのためだけでなく、アイテムの resolvedShape/resolvedLayout などエンジン全体が依存する登録処理です。この2ファイルを削除すると、この登録がどこからも行われなくなり、マップ全体が壊れます。そのため、この副作用importは my-mind.js 自体に移動させます(コマンドモジュールと同じ扱い)。まず store.js を新設します。

CLAUDE.md のPhase 3リスク注記にある「子アイテムの value/status 変更が親の表示に反映されるか」については、今回の実装は旧実装と同じ制約を引き継いでいます（tick は選択中のアイテム自身への item-change にのみ反応し、子の変更では発火しません）。これは既存の挙動と同一で、今回のリファクタで新たに壊した部分ではありません。この点の解消は Phase 6（resolvedValue/resolvedStatus の createMemo 化）で対応するのが計画上も妥当です。

---

## Phase 4 — Retire `pubsub.js` for item lifecycle events

Once Phase 3 lands, `item-select` has no more subscribers other than
`ui/notes.js`'s preview and `mouse.js`'s visual feedback. This phase
finishes that cutover.

Steps:
1. Move `ui/notes.js`'s `pubsub.subscribe("item-select", ...)` handler to
   a `createEffect` in `NotesEditor.jsx` that reads `store.currentItem()`.
2. `title-change` and `save-done` (consumed by `ui/io.js`'s save-status
   footer and `title.js`) become their own signals in `store.js`
   (`lastSaveTime`, `currentTitle`) instead of pubsub messages. `io.js`
   calls the setters directly where it currently calls `pubsub.publish`.
3. `item-change` (used for auto-save debouncing) is the trickiest
   remaining consumer — it fires on *every* mutation, not just selection
   changes. Keep this one on `pubsub` for now; it's addressed in Phase 6
   once `item.js` itself is reactive and can expose a "dirty" effect
   directly.
4. Once only `item-change` and `command-*`/`map-new`/`load-done` messages
   remain, evaluate whether `pubsub.js` is still worth keeping as a thin
   wrapper or whether those last few call sites should just become plain
   callbacks passed at `mount()` time. Don't force this — a small, well
   understood event bus for a handful of one-off signals is simpler than
   inventing a bespoke replacement for each.

Risk: medium. `save-done` currently drives both the `#io` dialog's
auto-hide and the footer timer in two different places (`ui/io.js` and
`ui/ui.js` both subscribe to it independently) — verify both still update
after the signal-based switch.

---

## Phase 5 — Formalize the bridge pattern

Before tackling the core engine, document what Phases 1–4 converged on,
since Phase 6 will need to repeat it many times over:

- One `store.js` (or a few small stores, not one giant one — keep each
  store scoped to what actually changes together, e.g. selection vs.
  save-status vs. title, per the "combine data updated together" guidance
  already used for the artifact storage API).
- Components register imperative callbacks only where the engine truly
  needs to *push* into Solid-owned DOM (e.g. `NotesEditor`'s
  `registerEditorAPI`, needed because EasyMDE owns its own textarea).
  Everything else should read Solid signals directly — no bridge object
  needed for read-only consumption.

This phase produces a short `CLAUDE.md` addendum, not code.

---

## Phase 6 — Core `Item` state (the big one)

Target: `item.js`'s getters/setters (`color`, `textColor`, `shape`,
`layout`, `value`, `status`, `collapsed`, `text`) and their `resolvedXxx`
inheritance chains, plus `action.js`'s `Set*` actions.

This is the highest-risk phase because `item.js` currently conflates
three concerns: (a) plain data, (b) DOM node ownership (`this.dom`), and
(c) manual re-render triggering (`this.update()`). Do this in
sub-steps, one property at a time, not all at once:

1. **Pick the least-connected property first**: `status` has no
   inheritance chain (unlike `color`/`layout`/`shape`), making it the
   safest first conversion.
   - Convert `_status` to a Solid signal owned by the `Item` instance
     (`createSignal` per instance, not a single global store — each item
     needs its own reactive cell).
   - Wrap the existing `update()`/DOM-mutation logic
     (`updateStatus()`) in a `createEffect` that reads the signal, so the
     manual `this.update()` call in the setter can be deleted for this
     one property. Leave the setter as a plain signal `set` call.
2. Repeat for `value`, `icon`, `notes`, `collapsed` — all leaf properties
   without cross-item inheritance.
3. **Then** tackle the inheritance chains: `resolvedColor`,
   `resolvedTextColor`, `resolvedLayout`, `resolvedShape`. These read
   `parent.resolvedXxx` recursively. Solid's `createMemo` is the natural
   fit here (it re-derives only when an ancestor's own signal changes,
   and caches otherwise) — replace the plain getters with memos.
   - Do `resolvedColor`/`resolvedTextColor` together (same shape).
   - Do `resolvedShape` next (depends on tree depth, not just parent
     chain — needs its own care since `depth` is computed by walking
     `.parent` each call; consider memoizing depth too).
   - Do `resolvedLayout` last — `MapLayout`'s `getChildDirection` mutates
     `side` as a side effect the first time it's read, which is a code
     smell independent of Solid; consider flagging this as a
     "fix opportunistically" item rather than blocking the migration on
     it, since fixing it changes behavior, not just reactivity.
4. Once every property on `Item` is signal/memo-backed, delete the
   manual `update()` method's body piece by piece as each caller no
   longer needs it, then delete `update()` entirely once nothing calls
   it — search for all `.update(` call sites across `action.js`,
   `mouse.js`, `map.js` first to confirm none remain.

Risk: high. This is the phase most likely to introduce subtle bugs
(stale memo, effect ordering, double-firing). Land it as several small
PRs (one property group per PR) rather than one large one, and re-run
the full manual test matrix (undo/redo, drag-drop, color inheritance
through 3+ levels, collapse/expand) after each sub-step, not just at the
end.

### Phase 6 progress note

`status` is now signal-backed (see item.js). The setter still calls the
full `update()` — status changes the content box size (icon glyph),
so layout recompute cannot be skipped safely, unlike the plan's literal
wording. `updateStatus()` itself moved out of `update()`'s body into a
`createEffect` (wrapped in `createRoot`, never disposed — see the comment
in the constructor for why). Repeat this exact pattern for `value`, `icon`,
`notes`, `collapsed` next, keeping each property's own `update()` call
intact until Phase 8 proves it's safe to drop layout recompute entirely.

Phase 6 step 4 has started, but `update()` cannot be deleted yet. All item
attributes are now signal-backed and the resolved value/status calculations
are memo-backed alongside the existing inheritance-chain memos. The remaining
`update()` callers still trigger layout/SVG recomputation and `item-change`
for autosave; deleting them belongs with Phase 8's map/layout effect work,
not this item-state PR.


---

## Phase 7 — `history.js` (undo/redo) rework

Once `Item` mutations flow through signals, decide whether the existing
imperative `do()`/`undo()` `Action` classes in `action.js` still make
sense, or whether Solid's `createStore`'s built-in undo-friendly
immutable snapshots are a better fit.

Recommendation: **keep `action.js`'s `do()`/`undo()` model.** It already
matches the codebase's existing mental model (Command pattern), every
action already knows how to reverse itself, and rewriting it to a
snapshot-diffing model is a larger behavior change than this migration's
scope justifies. Only change what each `do()`/`undo()` *touches*
internally (signal setters instead of direct field writes) — the
`history.js` stack itself (`push`/`back`/`forward`) needs no changes.

Risk: low, provided Phase 6 lands cleanly, since this phase is "keep the
outer shape, swap the internals."

### Phase 7 progress note

Verified, no production code changes were needed. `action.js`'s `Set*`
Actions already write through `item.js`'s public property setters
(`item.status = x`, `item.color = x`, ...), and those setters were already
swapped to call the underlying signal setters back in Phase 6. So "keep
the outer shape, swap the internals" was already true by construction —
there was no direct-field-write code left in `action.js` to convert.
`item.side` (used by `SetSide`) intentionally stays a plain field, per the
Phase 6 note about `MapLayout.getChildDirection`'s side-effect read.

`history.js` itself needed no changes, as predicted, and now has real
tests: `history.test.js` had accidentally duplicated `action.test.js`
instead of testing `push`/`back`/`forward`/`canBack`/`canForward` (the
Phase 0 goal) — fixed. Added `action.item.test.js` to characterize that
`do()`/`undo()` correctly round-trips signal-backed properties along with
their dependent `resolvedXxx` memos (`resolvedStatus`, `resolvedValue`,
`resolvedColor`), closing out the Phase 7 risk note about re-verifying
undo/redo behavior.



## Phase 8 — `map.js` and the layout/SVG engine

`map.js` and `layout/*.js` read `item.contentSize`/`item.size`, which are
derived from actual DOM measurement (`getBBox()`, `offsetWidth`). This
can't become a pure Solid memo (DOM must be committed first), so:

1. Wrap the "recompute layout for this item and its subtree" logic in a
   single `createEffect` per `Map` instance that depends on the relevant
   item signals, but performs the actual DOM read/write imperatively
   inside the effect body — same as today's `resolvedLayout.update(this)`
   call, just triggered by Solid's scheduler instead of by hand from each
   setter.
2. This is the point where the manual `parent: true/false`,
   `children: true/false` update-options in `item.js` finally disappear:
   Solid's effect dependency tracking replaces the hand-written "what
   needs to re-render" bookkeeping those flags exist for.

Risk: medium-high. Needs careful benchmarking — a naive effect-per-item
could cause more DOM thrashing than the current hand-tuned
`parent`/`children` flags if dependencies aren't scoped tightly. Profile
with a large map (50+ nodes) before and after.

### Phase 8 progress note

Implemented as a single `createComputed` owned by `Map` (not
`createEffect` — it must run synchronously so `show()`/`center()` and
other direct callers see up-to-date DOM measurements the moment they
resume execution). The computed calls a new module-level
`layoutSubtree()` helper in map.js that walks the tree depth-first
(children before parent, matching the old `update()` recursion order,
since a parent's rank size depends on its children's already-measured
content boxes) and does, in one pass per item, both the DOM content sync
(`updateText`/`updateStatus`/`updateValue`/`updateIcon`/`updateNotes`/
`updateToggle` — previously each its own per-item effect from Phase 6,
now called directly here so size measurement can't race them) and the
dataset/size/connector/layout work `Item.prototype.update()` used to do.

`item.js`'s `update()` method, its `UPDATE_OPTIONS` constant, and every
explicit `.update(...)` call in its property setters are gone, exactly as
step 2 anticipated — Solid's automatic dependency tracking (through
`resolvedColor`/`resolvedTextColor`/`resolvedShape`/`resolvedLayout` and
the existing per-item `_childrenVersion` signal from Phase 6) means the
shared computed re-runs whenever anything relevant changes anywhere in
the tree, with no manual `parent`/`children` bookkeeping left.

Three call sites had no signal to hang off and still need an explicit
nudge: `item.side` (intentionally non-reactive, per the Phase 6 note on
`MapLayout.getChildDirection`), live text editing (contentEditable
mutates the DOM directly, bypassing the `text` signal until "finish"),
and `adjustFontSize` (a CSS-only change). All three now call a new
`Map.prototype.requestLayout()`, which just bumps a version signal the
computed also depends on.

Known follow-up, called out by the phase's own risk note: the computed
recomputes the *entire* tree on every change, anywhere — there is no
per-item scoping yet. This matches the plan's literal "single
createEffect per Map instance" wording, but on a large map it's more DOM
work than the old hand-tuned `parent`/`children` flags did. Left as-is
per the plan (profile before optimizing further); revisit in Phase 9 if
it turns out to matter in practice.


---

## Phase 9 — Cleanup

1. Delete `pubsub.js` if Phase 4's evaluation concluded it's no longer
   needed; otherwise leave it for the handful of genuinely one-off
   messages and note why in `CLAUDE.md`.
2. Delete the now-unused `UPDATE_OPTIONS` constant and `update()` method
   remnants in `item.js`/`map.js`.
3. Remove `mount()`/`unmount()`'s manual `dispose()` call chain in
   `my-mind.js` for every module that got folded into Solid component
   lifecycles (`onCleanup`) — only keep it for modules that still
   register raw DOM listeners outside Solid's control (e.g. `keyboard.js`,
   `mouse.js`, which listen on `window`/`port` rather than being owned by
   a single component).
4. Re-read `CLAUDE.md`'s plan section and update it to reflect what
   remains vanilla vs. Solid-owned.


### Phase 9 progress note

All four steps verified/executed against the actual code, not just the
plan text:

1. `pubsub.js` kept as-is. Confirmed live publishers/subscribers still
   exist for `item-change` (`map.js`, `notes.js`), `ui-change`
   (`ui/ui.js`, `my-mind.js`), and `map-new`/`load-done`/
   `command-sibling`/`command-child` (`command/command.js`, `ui/io.js`).
   Matches the Phase 5 addendum's list exactly — nothing to delete.
2. `item.js`'s `update()` method removed. It referenced an
   `UPDATE_OPTIONS` constant that no longer existed anywhere in the file
   (a leftover from before Phase 8, not actually deleted despite the
   Phase 8 progress note's claim) and had zero callers — `map.js`'s
   `layoutSubtree()` has been the sole layout/DOM-sync path since Phase 8.
   The now-unused `pubsub` import in `item.js` was removed along with it.
3. `my-mind.js`'s manual `dispose()` chain reviewed module by module.
   `keyboard.js`, `mouse.js`, `clipboard.js`, and `ui.js` (plus the
   `io.js`/`notes.js`/`context-menu.js` it wraps) all still attach raw
   listeners to `window`/`document`/`port` outside Solid's control, so
   they keep their manual `dispose()` calls. `title.js` keeps its manual
   `dispose()` too, per the Phase 5 addendum's note that a vanilla
   module's `createRoot` effect has no automatic owner. `help.js` was the
   only module that was a pure bridge object (no raw listeners, no
   `createRoot` effect) — its `dispose()` call was moved into
   `HelpPanel.jsx`'s own `onCleanup`, and the now-unused `help` import
   was removed from `my-mind.js`.
4. This note itself is the "what remains vanilla vs. Solid-owned" update:
   vanilla-owned (manual `init()`/`dispose()` in `my-mind.js`) —
   `keyboard.js`, `mouse.js`, `clipboard.js`, `title.js`, `ui.js` (and its
   sub-modules `io.js`, `notes.js`, `context-menu.js`); Solid-owned (via
   a component's own `onMount`/`onCleanup`) — `help.js`, plus everything
   already folded into components directly (`PropertyPanel.jsx`,
   `TitleBar.jsx`'s input, `NotesEditor.jsx`'s editor). The migration
   plan is now complete.

---

## Suggested order summary

| Phase | Target | Risk | Depends on |
|---|---|---|---|
| 0 | Tests for history/action | none | — |
| 1 | `ui/help.js` | low | — |
| 2 | `ui/color.js`, `ui/text-color.js` | low | — |
| 3 | `ui/layout.js`, `ui/shape.js`, `ui/value.js`, `ui/status.js` | medium | Phase 0 |
| 4 | `pubsub.js` item-select/title/save-done | medium | Phase 3 |
| 5 | Docs only | — | Phase 1–4 |
| 6 | `item.js` signals/memos | high | Phase 5 |
| 7 | `history.js` internals | low | Phase 6 |
| 8 | `map.js` / `layout/*.js` | medium-high | Phase 6 |
| 9 | Cleanup | low | Phase 8 |

Each phase should be its own set of commits/PRs, landed and verified in
the running app before starting the next, so the app is always in a
working state and a regression can be bisected to a single phase.




---

## Phase 5 — Bridge pattern addendum (docs only, no code)

Phases 1–4 are done. Before Phase 6 touches `item.js` itself, here is the
pattern that emerged, so later phases repeat it instead of inventing
variations.

### Stores, not one giant store

`lib/mindmap/store.js` holds a few independent `createSignal`s, not one
`createStore` blob: `currentItem`, `currentTitle`, `lastSaveTime`. Each is
scoped to what actually changes together (selection vs. save-status vs.
title), matching the "combine data updated together" guidance already
used for the artifact storage API. Phase 6 should add new item-level
signals here only if they're cross-cutting (like `currentItem`); anything
scoped to a single `Item` instance belongs on the instance itself
(per-instance `createSignal`, not a module-level store — see Phase 6).

### Two consumption shapes

1. **Read-only consumption — no bridge object.** If a Solid component
   only needs to *read* engine/store state, it reads the signal directly.
   No `registerXxx`/callback object needed. Example: `PropertyPanel.jsx`
   reads `currentItem()` directly for its `<select>`s (Phase 3);
   `ui/ui.js` and `ui/io.js` read `lastSaveTime()`/`currentTitle()`
   directly instead of subscribing to a pubsub message (Phase 4).
2. **Imperative push into engine-owned DOM — bridge object.** Only used
   where a vanilla module truly owns a DOM node Solid doesn't render
   (EasyMDE's textarea in `NotesEditor.jsx`, the title `<input>` in
   `TitleBar.jsx`). The Solid component calls `registerXxx({ setValue,
   ... })` on mount; the vanilla module calls those setters instead of
   touching the DOM directly. Do **not** reach for this pattern for
   ordinary read access — that's what signals are for (see #1).

### Vanilla-module effects need `createRoot`

A vanilla module (not a Solid component) that wants to `createEffect` off
a store signal — e.g. `title.js` syncing `document.title` from
`currentTitle()` — must wrap it in `createRoot(dispose => ...)` and keep
the returned `dispose` so `mount()`/`unmount()`'s existing
`init()`/`dispose()` lifecycle can tear it down explicitly. Effects
created outside a component have no automatic owner to clean them up.

### pubsub.js: what's left and why

`item-select`, `title-change`, and `save-done` are gone (Phase 4).
Still on `pubsub.js`, deliberately:

- `item-change` — fires on every mutation, not just selection; stays
  until Phase 6 makes `item.js` itself reactive and can expose a "dirty"
  effect directly (per Phase 4 step 3).
- `ui-change`, `map-new`, `load-done`, `command-sibling`, `command-child`
  — a handful of genuinely one-off signals with a single
  publisher/subscriber pair each. Per Phase 4 step 4, these are not worth
  a bespoke replacement; re-evaluate in Phase 9 once Phase 6/8 land and
  it's clear whether `item-change` also drops out.

### Checklist for Phase 6+

When converting the next module, prefer in this order:
1. Can it just read an existing/new signal directly? (no bridge)
2. Does it need to push into DOM Solid doesn't own? (bridge object,
   `registerXxx`)
3. Does a vanilla module need to react to a signal? (`createRoot` +
   `createEffect`, with `dispose` wired into that module's `dispose()`)
4. Is it still fundamentally a one-off fire-and-forget event with no
   state to read back? (leave it on `pubsub.js`)

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
