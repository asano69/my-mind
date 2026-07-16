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

---

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
