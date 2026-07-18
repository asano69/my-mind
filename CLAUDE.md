# Overview


## Rules

- データベースのマイグレーションはPocketBaseのWEB UIから行うのでマイグレーションコードを作成する必要はまったくない。
- 後方互換性は維持しなくてよい。
- When fixing bugs, add a failing regression test first.
- All errors are user-facing, so messages should be clear.
- Keep functions small and focused.
- Module files should re-export what's needed, hide implementation details.
- 変更内容を git diff 形式で出力する。

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

docs/03.2 を実行中

## Markodwonエディタをマップの背景にもっていけないか検討
- 現在、マップの背景にマークダウンがプレビューされている。これを廃止する
- かわりにEasyMDEのViewモードをマップの背景に常に表示させてこれをプレビューモードとして使いたい。
- 現在、data-command="notes" を実行すると、手前に、EastMDEが表示されるが、それを廃止する。
- かわりに、 data-command="notes" を実行すると、背後にあるViewモードのEasyMDEがEditモードに切りかわり、MindMapCanvasの手前に表示したい
- 設計上、そのほうが扱いやすいならば、MindMapCanvas.jsxと、NotesEdiotr.jsxを、Workspace.jsxの子コンポーネントとしてもたせ、スイッチの切り替えにおうじて前面背面を切り替えるようにするとよい。

### Workspace.jsxの実装

MindMapCanvas.jsxとNotesEditor.jsxを子として常時マウントし、activeMode()に応じてCSSで前面/背面を切り替える（display:noneではなく、z-indexとpointer-events: noneで切り替える。display:noneだとNotesEditor内のCodeMirrorがレイアウト計算をやり直す羽目になるため）。
スイッチ操作（data-command="notes"実行時など）はsetActiveMode()を呼ぶだけにする。既存のui/notes.jsのtoggle()はそのまま「NotesEditorの表示/非表示」を担当し、Workspace側のactiveModeとは独立に保つ

