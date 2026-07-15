# Overview


## Rules

- データベースのマイグレーションはPocketBaseのWEB UIから行うのでマイグレーションコードを作成する必要はまったくない。
- 後方互換性は維持しなくてよい。
- ライブラリを書き換える場合は、余裕があれば、Solidのリアクティブな状態管理に書き換える。
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


# my-mind.js アンマウント安全化 — 段階的移行計画

- Catalog.jsxとMindMapCanvas.jsxを軽快に切り替えられるように、本格的なSPA化する。my-mind.js 自体をアンマウント安全（cleanup + 再 boot 可能）に作り直すために、シングルトンの状態を持つモジュール群（mouse.js, keyboard.js, io.js, ui.js …）すべてに手を入れる
  
## 0. 現状の問題を一言でまとめると

`frontend/src/lib/mindmap/` 配下のモジュールの多くが **モジュールスコープで `document.querySelector` を実行し、`init()` の中で `addEventListener`/`setInterval` を無条件に呼んでいる**。ESモジュールはページ内で一度しか評価されないため、

- `MindMapCanvas.jsx` が unmount → remount されても `keyboard.js` の `window.addEventListener("keydown", ...)` は**重複登録**され、ショートカットが2重・3重に発火する
- `ui/*.js`（color, layout, shape, value, status, help, notes, io, context-menu, ui.js）は**古い（DOMから外れた）要素**への参照を持ち続ける
- `io.js` の `setInterval(updateSaveStatus, 1000)` や autosave の `setTimeout` は remount のたびに増殖する

つまり今は「一度しか mount されない」ことを前提にした作りで、Catalog ⇄ マップ画面を行き来する本格SPA化とは根本的に相性が悪い。これを直すのが今回のゴール。

## 1. 目指す形（設計方針）

- 全モジュール共通ルール：**DOM参照の取得・イベント登録は必ず `init()` の中で行い、対になる `dispose()` を用意する**（モジュールトップレベルでの `querySelector` は禁止）。
- 個別モジュールに「自分が張った購読を覚えて解除する」責務を持たせるのは複雑になりがちなので、`pubsub.js` に **`reset()`**（購読を全消去）を追加し、`my-mind.js` の `unmount()` が最後に一括で呼ぶ。各モジュールは remount 時に気軽に再購読すればよい（シンプルさ優先）。
- `my-mind.js` は `boot()` を **`mount(root)` / `unmount()`** のペアに分割。多重mount/unmountに対してガードを入れる。
- 方針として「hide/showで使い回す」のではなく、**毎回破棄して作り直す**（undo履歴やcurrentMapもリセットされて当然なので、この方が単純）。

## 2. フェーズ分割（下から上へ、依存の少ないものから）

### Phase 0 — 準備・回帰テストの土台
- 現状のバグを実証する失敗テストを先に書く（CLAUDE.mdのルール通り）。例：jsdom上で `keyboard.init()` を2回呼び、1回の `keydown` で command が2回実行されることを確認するテスト。
- 影響モジュールの棚卸しリスト（本メッセージのAppendix相当）をIssue化。
- この段階ではコード変更なし。

### Phase 1 — 基盤ユーティリティ：`pubsub.js`, `history.js`
- `pubsub.js` に `reset()` を追加（`subscribers.clear()`）。
- `history.js` は既に `reset()` があるので変更不要、「unmount時に必ず呼ぶ」ことだけドキュメント化。
- 既存動作への影響なし（追加のみ）。

### Phase 2 — 依存の少ないUI部品
対象：`ui/color.js`, `ui/text-color.js`, `ui/value.js`, `ui/status.js`, `ui/shape.js`, `ui/layout.js`
- モジュールトップレベルの `const select/node = document.querySelector(...)` を `init()` 内に移動。
- `dispose()` を追加し、`removeEventListener` とモジュール変数を `null` に戻す（触ったら壊れたDOMに触れないよう防御的に）。
- これらは他モジュールへの依存がないので個別に安全にマージできる。

### Phase 3 — 中規模シングルトン
対象：`ui/help.js`, `ui/notes.js`, `ui/context-menu.js`, `ui/io.js`, `ui/file-switcher.js`
- `help.js` / `context-menu.js`：querySelectorをinit()内に移動するのみ。
- `notes.js`：`previewEl` を毎回 `main` に append しているので、`dispose()` で `previewEl?.remove()` して重複生成を防ぐ。
- `io.js`：
  - `node` の取得を `init()` 内へ。
  - `dispose()` で `clearInterval`（1秒タイマー）、`clearTimeout`（autosave）、`currentMapId` 等の状態リセットを行う（**ここが今回いちばん実害の大きいリーク源**）。
- `file-switcher.js`：`dispose()` で `cachedMaps = null` にし、再訪時に一覧を取り直す。

### Phase 4 — グローバルリスナーを持つモジュール
対象：`keyboard.js`, `mouse.js`, `clipboard.js`, `title.js`
- `keyboard.js`：`dispose()` で `window.removeEventListener("keydown", handleEvent)`。**ショートカット多重発火バグの本丸**。Phase 0のテストがここで green になるはず。
- `mouse.js`：`init(port)` で張ったリスナーを `dispose(port)` で外し、`current` 状態を初期化。ドラッグ中に unmount された場合に備え、`dispose()` 内で進行中のドラッグを強制終了。
- `clipboard.js`：`document.body` への `cut/copy/paste` リスナーを `dispose()` で解除。
- `title.js`：`pubsub.subscribe` の handler を無名関数からトップレベルの安定した関数に変更（またはPhase1の `pubsub.reset()` に頼る）。`inputAPI` を `dispose()` で `null` に戻す。

### Phase 5 — 集約モジュール：`ui/ui.js`
- `node`/`saveTimeEl` の取得を `init(port)` へ。
- `dispose()` で `document.removeEventListener("click", onClick)`、`clearInterval(elapsedTimer)`、そして配下の各UIモジュール（color, textColor, value, layout, shape, status, help, notes, io, menu）の `dispose()` をここから一括で呼ぶ（子モジュールのライフサイクル管理をここに集約）。

### Phase 6 — `map.js` の見直し
- `init()`（CSSフェッチ）は一度取得すればよいので `if (css) return;` を追加し、remount毎の無駄なfetchをなくす。
- `Map.hide()` は既にSVGノードをdetachしているので変更不要。

### Phase 7 — `my-mind.js` 本体の書き換え
- ファイル末尾の無条件 `boot();` を廃止し、`export function mount(root) {...}` / `export function unmount() {...}` に分割。
- `mount(root)`：多重mountガード → `currentMap/currentItem/selectedItems` 等を初期化 → Phase2〜6で直した各モジュールの `init()` を呼ぶ（`port` は引数の `root` を使う）。
- `unmount()`：`resize` リスナー解除 → 子モジュールを逆順に `dispose()` → `pubsub.reset()` → `history.reset()` → `currentMap?.hide()`。

### Phase 8 — `MindMapCanvas.jsx` の結線
- `<main ref={mainRef}>` として要素参照を取得し、`document.querySelector("main")` への暗黙依存をなくす。
- `onMount` で `mount(mainRef)`、`onCleanup` で `unmount()` を呼ぶよう変更。

### Phase 9 — 結合確認・ロールアウト
- Home → Catalog → 別マップのHome → Catalog … を繰り返す手動QA。
  - ショートカットが1回しか発火しないか
  - autosaveが重複PATCHしていないか
  - 別マップのundo履歴が残っていないか
  - コンソールに「detached DOM」系のエラーが出ないか
- Phase 0で書いた回帰テストが green になっていることを確認し、デバッグ用の一時コードを除去。

## 3. この順序にした理由

- **葉から根へ**：依存のないユーティリティ（pubsub/history）→ 単純なUI部品 → 複雑な状態を持つモジュール → 集約モジュール → エントリポイント、の順にすることで、各フェーズを個別にマージ・動作確認できる。
- **Phase 8まで既存の `boot()` は温存**：Phase 1〜6はすべて「`init()`/`dispose()` を追加するだけ」で、`boot()` を1回しか呼ばない現状の動作は変えない。壊れるとしたらPhase 7・8だけなので、リスクを最後に集約できる。
- **`pubsub.reset()` による一括解除**：各モジュールに個別のunsubscribe管理を持たせると実装量・レビュー量が増える。シンプルさ優先の方針に沿って、購読解除は`unmount()`側で一括、という設計にした。
