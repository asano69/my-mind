# Workspace 前面/背面切り替え対応 — 段階的リファクタリング計画

## 背景

CLAUDE.md記載の「グローバルスコープにイベントリスナーを登録しているモジュールのリファクタリング」（`keyboard.js`/`clipboard.js`/`ui/ui.js`のクリック委譲/`mouse.js`のfocus処理）は完了済み。
いずれも`mount(containerEl)`/`unmount()`のライフサイクルに紐づいており、`MindMapCanvas.jsx`が何度マウント・アンマウントされても二重登録は起きない。

次のゴールは、`MindMapCanvas.jsx`と`NotesEditor.jsx`を`Workspace.jsx`の子として**常時マウントしたまま**、スイッチ操作で前面/背面（＝アクティブな編集モード）を切り替えられるようにすること。
これは「アンマウントで後始末する」という前提を崩す変更なので、既存のリファクタリングでは想定していなかった箇所にリスクが残る。

## Non-goals

- 複数のマインドマップキャンバスを同時に開く（マルチインスタンス）対応はスコープ外。今回はあくまで「1つのキャンバス + 1つのノートエディタ」を前面/背面で切り替えるだけ。
- `pb_data`側やバックエンドの変更は不要。

## 前提の変更点

現状の`MindMapCanvas.jsx`は`onMount`で`engine.mount()`、`onCleanup`で`engine.unmount()`を呼んでいる。Solidの`<Show>`や`@solidjs/router`の`<Route>`切り替えはコンポーネントをアンマウントするため、これまでは「非表示 = アンマウント」で一貫していた。
Workspace化後は「非表示 = CSSで隠すだけ、コンポーネントはマウントされ続ける」に変わる。つまり**mount/unmountの回数は変わらない（アプリ起動中1回ずつ）が、「非アクティブな期間」が新たに生まれる**。既存のリスナー類は「マウントされている＝アクティブ」を前提にしているため、この前提が崩れる箇所を洗い出して直す。

---

## Phase 1 — アクティブ状態を表す共有シグナルの導入

まず「前面/背面」を表す状態を`store.js`に1つ追加する。他の全フェーズがこれに依存するので最初に行う。

- `store.js`に`export const [activeMode, setActiveMode] = createSignal("canvas")`（値は`"canvas"` | `"notes"`）を追加。`leftPanelHidden`/`rightPanelHidden`と同じく、読み書きともに素のシグナルでよい（ブリッジ不要）。
- `Workspace.jsx`（新規）がスイッチ操作でこれを更新する。
- この時点ではまだ何もこのシグナルを参照しない。土台のみ。

リスク: なし。

---

## Phase 2 — `window` resizeリスナーをアクティブ状態でガードする

`my-mind.js`の`window.addEventListener("resize", handleResize)`は`mount()`のライフサイクルにのみ紐づいており、Workspace化後もキャンバスが背面にある間ずっと発火し続ける。実害は大きくないが、無駄な計算と「非表示要素に対するDOM測定」が走る。

- `handleResize()`の先頭で`if (activeMode() !== "canvas") return;`を追加。
- 前面に戻ったタイミング（`activeMode`が`"canvas"`に変わった瞬間）で一度`handleResize()`を呼び直す必要がある。`my-mind.js`の`mount()`内に既にある`createEffect(on(leftPanelHidden, handleResize, { defer: true }))`と同じパターンで、`createEffect(on(activeMode, () => activeMode() === "canvas" && handleResize()))`を追加する（`defer: true`は付けない。背面から戻った直後に一度は必ず再計算したいため）。

リスク: 低。ガード漏れがあっても「無駄な計算が残る」だけで、既存動作を壊す方向のバグにはならない。

---

## Phase 3 — キーボード/マウス/クリップボードのスコープを「アクティブなときだけ」に絞る

`keyboard.js`・`mouse.js`・`clipboard.js`・`ui/ui.js`のクリック委譲は、いずれも`containerEl`にリスナーを張るだけで、`activeMode`のことを知らない。
NotesEditorが前面にある間、キャンバス側のショートカット（Delete、Ctrl+Z等）が裏で反応してしまうと事故になる。

- 各モジュールの`handleEvent`相当の関数の先頭に、`if (activeMode() !== "canvas") return;`を追加する（`keyboard.js`の`handleEvent`、`mouse.js`の各`onXxx`、`clipboard.js`の`onCopyCut`/`onPaste`、`ui/ui.js`の`onClick`）。
- 個別に散らすと漏れやすいので、共通の小さいヘルパーを1つ作る:
  ```js
  // scope.js — shared guard for engine-only listeners while the canvas
  // is not the active workspace mode.
  import { activeMode } from "./store.js";
  export function isCanvasActive() {
    return activeMode() === "canvas";
  }
  ```
  各モジュールはこれをimportして先頭で早期returnする。
- `command/command.js`の`Pan`コマンド（`window`ではなく`keyboardScope`＝`containerEl`に`keyup`を張る動的リスナー）も同様に、`execute()`の先頭でガードする。

リスク: 中。ガードを入れる箇所が多く、1箇所でも漏れると「背面にいるのに操作できてしまう」バグになる。各モジュールごとに単体テストを1本ずつ追加してから直す（CLAUDE.mdの既存ルール「バグ修正の前に失敗する回帰テストを書く」に従う）。

---

## Phase 4 — シングルトンDOM-ID依存モジュールの棚卸しと確認

`ui/notes.js`（`#notes`）・`ui/io.js`（`#io`）・`ui/context-menu.js`（`#context-menu`）は`document.querySelector("#id")`でDOM要素を直接引いている。

今回のスコープ（キャンバス1つ・ノートエディタ1つを常時マウント）では、これらのIDがDOM上に重複することはないため**壊れない**。ここは手を入れず、「複数キャンバス同時マウントに拡張する場合は要見直し」という制約をコードコメントとして残すだけにする。

- 各ファイルの`init()`直前に一行コメントを追加: `// Assumes a single instance in the DOM (see docs/workspace-mode-switch-refactor.md, Phase 4).`

リスク: なし（コメント追加のみ）。

---

## Phase 5 — `file-switcher.js`の`document.body`直付けをコンテナスコープに寄せる

`ui/file-switcher.js`だけは`containerEl`の外、`document.body`に直接オーバーレイをappendしている。Workspace化で前面/背面が入れ替わっても、このオーバーレイは常にどちらの上にも被さってしまう。

- `show()`に`containerEl`引数を追加し、`document.body.appendChild(backdrop)`を`containerEl.appendChild(backdrop)`に変更する。
- `toggle()`/`dispose()`にも`containerEl`を引き回す（`command/command.js`の`QuickLoad`/`Load`コマンドが呼び出し元なので、そこも`containerEl`を渡すよう修正）。
- Phase 3の`isCanvasActive()`ガードも`toggle()`の先頭に追加し、背面から誤って開けないようにする。

リスク: 低〜中。呼び出し元（`command.js`）のシグネチャ変更を伴うため、`Ctrl+K`/`Ctrl+O`の動作を手動確認する。

---

## Phase 6 — `Workspace.jsx`の実装

土台が揃ったところで、実際にラッパーコンポーネントを作る。

- `MindMapCanvas.jsx`と`NotesEditor.jsx`を子として常時マウントし、`activeMode()`に応じてCSSで前面/背面を切り替える（`display:none`ではなく、z-indexと`pointer-events: none`で切り替える。`display:none`だとNotesEditor内のCodeMirrorがレイアウト計算をやり直す羽目になるため）。
- スイッチ操作（`data-command="notes"`実行時など）は`setActiveMode()`を呼ぶだけにする。既存の`ui/notes.js`の`toggle()`はそのまま「NotesEditorの表示/非表示」を担当し、Workspace側の`activeMode`とは独立に保つ（CLAUDE.mdの元々の設計案「背面のViewモードEasyMDEが前面のEditモードに切り替わる」に相当する部分は別途検討）。

リスク: 中。前面/背面切り替えの見た目・フォーカス移動を手動確認する必要がある。

---

## Phase 7 — 回帰チェックリスト

- キャンバスが前面のとき: 全ショートカット、ドラッグ&ドロップ、コピペ、コンテキストメニューが動作する。
- ノートが前面のとき: キャンバス側のショートカットが一切反応しない。ノート側の操作（EasyMDEのツールバー、Escape）は正常。
- 前面→背面→前面と往復した直後、`handleResize()`が最新のパネル幅で再計算されている。
- `Ctrl+K`（file-switcher）が前面のキャンバスにだけ被さり、背面のノート上に出ない。
- 上記すべてを、ブラウザの`resize`イベントを一度も発生させずに確認する（Phase 2のガード漏れがあると、この状態でだけ再現するため）。

---

## フェーズ一覧

| Phase | 内容 | リスク | 依存 |
|---|---|---|---|
| 1 | `activeMode`共有シグナルの追加 | なし | — |
| 2 | `window` resizeリスナーのガード | 低 | Phase 1 |
| 3 | keyboard/mouse/clipboard/uiクリックのガード | 中 | Phase 1 |
| 4 | シングルトンDOM-IDモジュールの棚卸し（コメントのみ） | なし | — |
| 5 | `file-switcher.js`のコンテナスコープ化 | 低〜中 | Phase 3 |
| 6 | `Workspace.jsx`の実装 | 中 | Phase 1–5 |
| 7 | 回帰チェックリスト | — | Phase 6 |

各フェーズは独立してマージ可能。前フェーズの動作確認が終わってから次に進む（既存の`docs/mindmap-state-refactor.md`と同じ運用方針）。