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

# グローバルスコープにイベントリスナーを登録しているモジュールのリファクタリング

MindMapCanvas.jsxと、NotesEdiotr.jsxを、Workspace.jsxの子コンポーネントとしてもたせ、スイッチの切り替えにおうじて編集モードを切り替えるような用途を考えたとき、グロバールリスナーはスコープの制御が難しく、バグの温床になりやすい。グローバルリスナーをローカルスコープに変更するには、SolidJSのコンポーネントライフサイクルを活用し、各モジュールのリスナー登録先を適切なスコープに変更する必要があります。


現在のアーキテクチャでは、`MindMapCanvas.jsx`がマウントされると、以下のグローバルリスナーが登録されます：

- `keyboard.js`: `window`に`keydown`リスナー
- `clipboard.js`: `document.body`に`cut`/`copy`/`paste`リスナー
- `ui.js`: `document`に`click`リスナー
- `my-mind.js`: `window`に`resize`リスナー

Workspace.jsxでスイッチングすると、非表示のコンポーネントのリスナーが残り続け、バグの原因になります。

## 事前分析（コード変更なし）

**問題1: スコープ先の取り違え**
`ui.js`のクリック委譲は`data-command`属性を持つボタンを拾っていますが、それらのボタン(`LeftPanel`/`RightPanel`/`TopBar`/`HelpPanel`/`ContextMenu`)は`MindMapCanvas.jsx`内で`<main ref={mainRef} />`の**兄弟要素**です。CLAUDE.mdの提案通り`port`(=mainRef)だけにスコープを絞ると、これらのボタンのクリックが届かなくなります。→ 全部を包む共通の祖先要素が必要です。

**問題2: フォーカスとバブリングの相性**
`keydown`はイベントターゲット(=現在フォーカスされている要素)からDOMツリーを**上に**バブルします。`mouse.js`の`onDragStart`は現在 `document.activeElement.blur()` でフォーカスを`<body>`(デフォルト)に戻していますが、`body`はコンテナ要素の**祖先**であり子孫ではないため、スコープをコンテナに絞った瞬間、フォーカスなし状態でのショートカットがすべて無反応になります。→ 「blurする」から「コンテナへ明示的にfocusする」への設計変更が必須です。

## フェーズ計画

| Phase | 内容 | リスク |
|---|---|---|
| 1 | `MindMapCanvas.jsx`に共通ラッパー要素(`containerRef`, `tabIndex=-1`)を追加。まだ何にも接続しない、純粋な足場 | なし |
| 2 | `mouse.js`の`document.activeElement.blur()`を`containerEl.focus()`に置換。`my-mind.js`の`mount(port, containerEl)`経由で伝搬 | 低（フォーカス経路の変更のみ） |
| 3 | `keyboard.js`のリスナーを`window`→`containerEl`へ。`command.js`の`Pan`コマンドの`window`keyupリスナーも同様に対応 | 中（ショートカット全体に影響するため回帰確認必須） |
| 4 | `clipboard.js`のリスナーを`document.body`→`containerEl`へ | 低 |
| 5 | `ui.js`のクリック委譲を`document`→`containerEl`へ | 低 |
| 6 | 回帰チェックリスト実施（ショートカット、Undo/Redo、コピペ、パネルボタン、Notes内Escape、ドラッグ後のフォーカス復帰） | — |

各フェーズは独立してマージ可能で、前のフェーズの動作確認が終わってから次に進みます。

- 現在の`ui.isActive()`はDOM構造に依存していますが、SolidJSのシグナルベースの状態管理に置き換えることで、DOM依存を減らせます。
- `Pan`コマンドのように動的に`window`にリスナーを登録するケースは、ポート要素に変更する必要があります。 
- `my-mind.js`の`resize`リスナーは、ウィンドウサイズがアプリ全体で共有されるため、グローバルのままでも問題ない可能性があります。ただし、リサイズ時の処理をアクティブなコンポーネントに限定する必要があります。 



## Markodwonエディタをマップの背景にもっていけないか検討
- 現在、マップの背景にマークダウンがプレビューされている。これを廃止する
- かわりにEasyMDEのViewモードをマップの背景に常に表示させてこれをプレビューモードとして使いたい。
- 現在、data-command="notes" を実行すると、手前に、EastMDEが表示されるが、それを廃止する。
- かわりに、 data-command="notes" を実行すると、背後にあるViewモードのEasyMDEがEditモードに切りかわり、MindMapCanvasの手前に表示したい
- 設計上、そのほうが扱いやすいならば、MindMapCanvas.jsxと、NotesEdiotr.jsxを、Workspace.jsxの子コンポーネントとしてもたせ、スイッチの切り替えにおうじて前面背面を切り替えるようにするとよい。

