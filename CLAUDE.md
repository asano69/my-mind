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
- バックエンドは、go-templateをつかったSSRアプリを前提にした構造から、Solid.jsをつかったSPAを前提にした構造に書き換えている。
- フロントエンドは、Pure JSを使ったレガシーな構造から、Solidの宣言型リアクティビティに置き換える。
- フロントエンドは、マインドマップエンジンのコンポーネント化も進めている。
- 重複コード、未使用コードの削除を優先的に行う。



# Work in progress

## Notes Editorのリファクタリング

現在、Markdown Editor (NotesEditor.jsx) が壊れている。
ライブエディタである点はすばらしいのだが、data-command="notes " を実行すると、エディタペインが右側から表示されるが、それを廃止したい。
そうではなくて、MidmapCanvas.jsxの背景は直接ライブエディタで編集できるようにしたい（今現在、notesの中身のマークダウンがhtmlとしてプレビューされているが。）data-command="notes " を実行するとフォーカスが全面マインドマップからその背後のエディタに切り替わるようなイメージだ。マインドマップ編集モードとノート編集モードをトグルスイッチで切り替えるイメージだ。

参考までに、Milkdownは, solidに公式対応しているので、参考ドキュメントがあった。


```
import { defaultValueCtx, Editor, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { nord } from '@milkdown/theme-nord'
import { onCleanup, onMount } from 'solid-js'

const Milkdown = () => {
  let ref
  let editor
  onMount(async () => {
    editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, ref)
      })
      .config(nord)
      .use(commonmark)
      .create()
  })

  onCleanup(() => {
    editor.destroy()
  })

  return <div ref={ref} />
}
```

# 設計計画

## 1. ゴールの再整理

**現状**: `NotesEditor.jsx` は `#notes` という `.pane`（画面右からスライドインするサイドパネル）。`ui/notes.js` が別途 `#note-preview`（透かし文字のプレビュー）を `<main>` に直接注入して背景に重ねている。ノート編集用の実データはサイドパネル、閲覧用の透かしは別要素、という二重構造。

**新状態**: ライブの Milkdown エディタ1つだけを、キャンバス背景の透かし相当の位置（`z-index` でキャンバスより奥）に常時マウントしておく。「ノートモード」は透かし表示とインタラクティブ編集の切り替えでしかない。

- 非アクティブ時: `pointer-events: none` ＋ 低opacity（透かし相当）、キャンバス（`<main>`）が最前面でクリック可能
- アクティブ時: エディタが `pointer-events: auto` ＋ フォーカス、`<main>` 側が `pointer-events: none` になり操作がすり抜けてエディタに届く

---

## 2. 状態管理: `store.js`

`leftPanelHidden`/`rightPanelHidden` と同じ「ブリッジ不要、直接シグナル参照」パターンを踏襲。

```js
export const [notesActive, setNotesActive] = createSignal(false);
export function toggleNotes() { setNotesActive((a) => !a); }
export function closeNotes() { setNotesActive(false); }
```

`notes.toggle()`/`notes.close()`（vanilla モジュール側の関数）は廃止し、呼び出し元（`command.js`, `command/edit.js`）は `store.js` を直接呼ぶように変更。ui/notes.js はもう「ペインの開閉」を管理する理由がなくなる。

---

## 3. `ui/notes.js` の簡素化

現状の責務: プレビューDOM生成/破棄、ペインのhidden切り替え、`onItemSelect`/`onEditorChange`。

新しい責務は最後の2つだけ:

```js
import * as app from "../my-mind.js";
import { bumpDirty } from "../store.js";

let editorAPI = null;
export function registerEditorAPI(api) { editorAPI = api; }

export function onItemSelect(item) {
  if (!item) return;
  editorAPI?.setContent(item.notes);
}

export function onEditorChange(text) {
  if (!app.currentItem) return;
  app.currentItem.notes = text.trim();
  bumpDirty(); // 既存のコメント通り、冗長でも可読性のため明示的に残す
}

export function init() {}
export function dispose() { editorAPI = null; }
```

`toggle()`/`close()`/`previewEl`/`updatePreview()` は全削除。`init()`/`dispose()` は `ui/ui.js` からの呼び出し契約（`[notes, io].forEach(ui => ui.init())`）を壊さないためだけに空関数として残す。

---

## 4. `NotesEditor.jsx` の再設計

責務: Milkdown(Crepe) の1インスタンスを保持し続け、`notesActive` に応じて `pointer-events` とフォーカスを切り替える。

- **常時マウント**は現状のまま維持（`MindMapCanvas.jsx` に変更不要）。
- **背景レイヤー化**: `<div id="notes">` を `position: fixed; inset: 0; z-index: -1;` にし、`classList={{ active: notesActive() }}` で状態を反映。実際の pointer-events/opacity 切り替えは CSS 側（`#notes` / `#notes.active`）に寄せる（インラインstyleは避け、既存のCSS変数駆動スタイルの流儀に合わせる）。
- **フォーカス制御**: `notesActive()` を購読する `createEffect` で、ProseMirror の `[contenteditable="true"]` 要素を `querySelector` して `.focus()`/`.blur()`。Crepe/ProseMirror の DOM ノードは通常インスタンス生存中に replace されないため、`onMount` 完了後に一度 query すれば十分（キャッシュ）。
- **退出経路（重要な設計ポイント）**:
  - `keyboard.js` の `ui.isActive()` は「Milkdownのcontenteditableにフォーカスがある間」`true` を返すため、グローバルショートカット（Escapeにひもづく `Cancel` コマンド含む）は一切発火しない。したがって **Escapeでの終了はエディタ自身のDOM要素にローカルな `keydown` リスナーを貼って処理**する必要がある（`containerEl.addEventListener("keydown", ...)`、`e.stopPropagation()` してブラウザ既定と衝突しないようにする）。
  - **クリックアウェイでの終了**: contenteditable要素の `blur` イベントに `closeNotes()` を紐付ける。左右パネルやTopBarのボタンは別要素で `pointer-events: auto` のままなので、それらをクリックすると自然にblurが発生し閉じる。
  - **明示的な終了ボタン**: 発見可能性のため、小さな "Done" ボタンをアクティブ時のみ表示（既存の `NotesEditor.jsx` にあった close ボタンの後継、最小限のスタイルで）。
  - **再度のコマンド実行**: `data-command="notes"` ボタン（RightPanel）やショートカット（ctrl+M、ただしこれは編集フォーカス中は前述の理由で効かない点に注意）や ContextMenu からの実行は `toggleNotes()` を直接呼ぶだけなので変更不要。

- `marked`/`renderMarkdown` 関連は完全削除（プレビュー用HTML変換が不要になったため）。

---

## 5. コマンド配線の変更

- `command/command.js` の `Notes` コマンド: `notes.toggle()` → `store.js` の `toggleNotes()` を直接呼ぶ。`import * as notes from "../ui/notes.js"` は不要になるので削除。
- `command/edit.js` の `Cancel` コマンド: `notes.close()` → `closeNotes()`（`store.js` から import）。既存の `import * as notes from "../ui/notes.js"` を置き換え。

---

## 6. キャンバス（`<main>`）の pointer-events 切り替え

これは engine 側（`my-mind.js`）に触れず、**`MindMapCanvas.jsx` 側で完結**させるのがシンプル（Phase 5 addendum の「read-only consumption は直接シグナル参照」方針にも合致）。

```jsx
import { notesActive } from "../lib/mindmap/store";
...
<main ref={mainRef} classList={{ "notes-mode": notesActive() }} />
```

実際の `pointer-events: none` は CSS（`main.notes-mode` セレクタ）で当てる。`my-mind.css` に1ルール追加するだけで済み、`my-mind.js`/`mouse.js` は無改修。

---

## 7. CSSレイヤリング戦略

- `#notes`: `position: fixed; inset: 0; z-index: -1; pointer-events: none; opacity: <低め>;`
- `#notes.active`: `pointer-events: auto; opacity: 1;`
- `main.notes-mode`: `pointer-events: none;`
- 他の要素（TopBar/LeftPanel/RightPanel/ContextMenu/HelpPanel/SaveDialogなど）は既存通り明示的な `z-index`（1, 5, 10）や別要素として独立しているため無改修で「常に最前面」を維持できる。
- 削除対象（デッドコード）:
  - `my-mind.css` の `.pane#notes` ブロック（幅50%、flexカラム、モバイル用bottom-sheetメディアクエリ含む）
  - `my-mind.css` の `#note-preview` / `#note-preview-inner` 一式（h1〜imgのタイポグラフィ含む）
- `NotesEditor.css` は Crepe テーマ変数マッピング（`--crepe-color-*`）部分は流用し、レイアウト部分（`#notes-editor`, `#notes-editor-bar` の flexカラム/ヘッダー）を背景レイヤー用に作り直す。

---

## 8. 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `frontend/src/lib/mindmap/store.js` | `notesActive`/`toggleNotes`/`closeNotes` 追加 |
| `frontend/src/lib/mindmap/ui/notes.js` | 全面簡素化（プレビュー/ペイン管理を削除） |
| `frontend/src/components/NotesEditor.jsx` | 背景レイヤー化、フォーカス制御、Escape/blur/Doneボタンによる終了経路 |
| `frontend/src/components/NotesEditor.css` | パネル用CSSを削除、背景レイヤー用CSSに置換 |
| `frontend/src/lib/mindmap/command/command.js` | `Notes` コマンドが `toggleNotes()` を呼ぶよう変更 |
| `frontend/src/lib/mindmap/command/edit.js` | `Cancel` コマンドが `closeNotes()` を呼ぶよう変更 |
| `frontend/src/routes/MindMapCanvas.jsx` | `<main>` に `notesActive` 連動のクラス付与 |
| `frontend/public/my-mind.css` | `.pane#notes` と `#note-preview` 系ルールを削除 |

**無改修（意図的）**: `ui/ui.js`（`notes.init()/dispose()` 呼び出し契約は維持）、`ContextMenu.jsx`、`RightPanel.jsx`、`my-mind.js`、`keyboard.js`、`mouse.js`。

---

## 9. 留意点・リスク

1. **`keyboard.js` の `ui.isActive()` 抜け穴**: Milkdown編集中はグローバルショートカットが死ぬので、Escapeでの終了は必ずローカルリスナーで担保する（上記の通り実装予定）。
2. **フォーカスのタイミング**: `notesActive` が `true` になった直後、Crepeがまだ非同期初期化中（`ready()` 前）だとフォーカス対象のDOMが無い可能性があるため、`ready()` ガードを効かせる。
3. **アイテム切替とアクティブ状態の独立性**: `currentItem` が変わっても `notesActive` はそのまま維持でよいか？ → 現状の要件では特に閉じる指示がないので維持する（ノード選択を変えながら複数ノートを見比べて編集できる方が自然）。
4. **remount安全性**: `dispose()` で `editorAPI = null` は既存通り。`notesActive` はモジュールを跨いで持続するシグナルなので、`unmount()` 時に `false` にリセットすべきか要検討（他の `leftPanelHidden`/`rightPanelHidden` は unmount時にリセットしていない点と平仄を合わせ、**リセットしない**方針を予定）。

