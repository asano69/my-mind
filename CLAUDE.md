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
