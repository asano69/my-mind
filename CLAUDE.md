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

ユーザーはエディターのUIをリファクタリングしたいと考えている。現状では、NotesEditorがサイドペインにポップアップ表示され、オンオフが切り替わるようになっているが、ユーザーはライブエディターをMindMapCanvasの背景に直接埋め込み、現在の透かし入りのノートプレビューを置き換えたいと考えている。 
ノート コマンドがトリガーされると、パネルをスライドアウトするのではなく、フォーカスはこの背景エディタ レイヤーに移動します (ポインタ イベントがアクティブになります)。そして、ノート モードがアクティブかどうかに基づいてポインタ イベントが切り替わるマインド マップ キャンバスがその上に表示されます。プレビューとペインが現在どのように機能しているかを理解するために、既存のコード構造を調べ始めています。ユーザーは、エディタを背景レイヤー (ウォーターマーク プレビューを置き換える) にし、z-index 0 でマインド マップ キャンバスの背後に配置し、デフォルトではポインタ イベントを無効にして、マインド マップが最前面でインタラクティブな状態を維持することを望んでいます。そして、ノート コマンドがアクティブになると、エディタでポインタ イベントが有効になり、フォーカス可能でインタラクティブになり、背後のマインド マップは非インタラクティブになります。ノート エディタがアクティブになると、不透明度を上げたり、背景を暗くしたりして目立つようにする視覚的なフィードバックを追加しますが、今のところは最小限にとどめます。エディタは、onItemSelect および onEditorChange ハンドラを介してノードごとのノートの追跡を既に処理しているので、その点はカバーされています。読み取り専用のプレビューをライブのMilkdownエディタに置き換えるので、古いプレビュー要素を削除して、NotesEditorコンポーネントを編集と表示の両方に使用できます。 
CSSについては、既存の#note-previewスタイルを再利用しますが、Milkdownコンテナに対応するように更新します。実装計画としては、toggleおよびclose関数を持つnotesActiveシグナルをストアに追加し、その後、古いプレビュー要素への参照を削除することでui/notes.jsを簡素化します。 
NotesEditor.jsxは既にMindMapCanvas.jsxに常時マウントされているので、それを常に表示させておき、アクティブ状態を利用してポインターイベント、透明度、フォーカスを制御するだけでよい。


Looking at this, I'll redesign the notes editor from a slide-in side panel into an always-mounted background layer (like the old watermark), and make the "notes" command just toggle whether that layer is interactive/focused.
Plan:
1. **store.js** — add a `notesActive` signal (replaces the pane's hidden/shown state).
2. **ui/notes.js** — drop the DOM-owning preview code entirely; it becomes a thin bridge that pushes item content into the editor and toggles the signal.
3. **NotesEditor.jsx** — render Milkdown as a fixed full-screen layer behind the canvas; react to `notesActive` by toggling pointer-events/opacity and focusing/blurring the ProseMirror element.
4. **CSS** — restyle as a background layer with `z-index: -1` (safe: everything else — main, panels, context-menu — is a positioned element with `z-index: auto`/explicit values, so it stays above without needing to touch any other file), and delete the now-dead pane/preview rules.
Let's do it.

### Memo
I'm examining the current implementation to understand how the notes editor works. The NotesEditor component renders a hidden pane containing a Crepe editor with a close button, exposing setContent and renderMarkdown through the bridge API. Meanwhile, the ui/notes.js module manages the preview elements injected into the main DOM, handling the toggle and close functionality for the notes pane, and syncing content when items are selected.
Looking at the broader architecture, the Notes command just triggers the toggle, and the styling is split between my-mind.css for the pane layout and NotesEditor.css for the editor itself. To refactor this, I need to add a notesActive signal to the store with corresponding toggle and close functions, then simplify ui/notes.js by removing the DOM-based toggle logic and preview generation, keeping only the item selection and editor change handlers. The key insight is that the live editor should replace the current watermark preview entirely—instead of showing a static HTML preview in the background, the editable Milkdo editor becomes the visible layer when active.
Defining the simplified notes module... Now I need to check how ui.js and NotesEditor.jsx interact with notes.js — ui.js calls notes.init() and notes.dispose(), while NotesEditor.jsx dynamically imports notes and uses it for editor change listeners and item selection effects. Since I'm removing the close button from the side panel (which no longer exists), I should clean up that reference and keep just a minimal top bar for toggling notes mode.
For the NotesEditor redesign, I'm making the container a fixed background layer with conditional pointer-events and opacity based on notesActive state — when active it's interactive and visible, when inactive it's transparent and non-interactive. I also need to manage focus on the contentEditable node inside the editor and toggle pointer-events on the canvas itself to prevent conflicts when notes mode is active.