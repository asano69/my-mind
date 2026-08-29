# マインドマップの複数タブ表示実装

マルチインスタンス自体（`createMindMap()` によるインスタンス独立性）は `01-plan.md` Step 5 と `instance.test.js` で既に確認済みですが、それは「エンジンの状態が複数生成できる」という土台に過ぎません。「複数タブとして自由に切り替えられるUI」まで持っていくには、まだいくつも欠けているものがあります。

## 1. アプリ側が今も「単一インスタンス前提」のまま

`frontend/src/lib/mindmap/engineInstance.js` は `createMindMap()` を**アプリ起動時に1回だけ**呼び、その中身をモジュールレベルでフラットに再export しています。`NewMindMapPreview.jsx`・`RightPanelProperties.jsx`・`TopBar.jsx`・`ContextMenu.jsx`・`LeftPanel.jsx`・`ValueDialog.jsx` は全てここから直接 `currentItem`/`selectItem`/`newMouse` 等を import しています。

タブが複数になれば「どのタブのインスタンスか」を教えてもらう必要があるので、この直接import を **Solid Context**（`02-plan.md` が提案する `MindMapContext`/`useMindMap()`）か、少なくとも「アクティブなタブのインスタンスを指す1つの間接参照」に置き換える必要があります。今のままだと2つ目のタブを開いた瞬間、全パネルが常に最初のタブの状態を表示し続けます。

## 2. `document` capture phase のリスナーは本質的に1つしかありえない

`newClipboard.js`（cut/copy/paste）は `document` に capture phase でリスナーを貼ります。`createClipboardController()` はインスタンスごとに独立した controller を作れますが、**2つのタブが両方 `init()` を呼ぶと、同じ `document` に2つのリスナーが重複登録され、両方が同時にペーストを処理しようとします**。

`02-plan.md` 自身が書いている通り、「今アクティブな instance がどれか」を1つだけ購読する薄いブローカーが必要です。具体的には:
- タブ切り替え時に、前アクティブなインスタンスの `clipboard.dispose()` を呼び、新アクティブなインスタンスの `clipboard.init()` を呼ぶ、または
- clipboard 側にブローカーを内蔵し、「現在アクティブなコントローラ」を切り替えるだけで済むようにする

これがないと動作は無関係、`scope.js` だけでは防げません（`scope.js` は「入力の所有者」の話で、「リスナーの重複登録」は別問題です）。

## 3. `scope.js` はグローバルsingletonのまま

`packages/mindmap-engine/src/scope.js` の `baseScope`/`pushedScopes` はモジュールレベルの単一状態です。`isCanvasActive()` はアプリ全体で1つしかない前提。複数タブを**同時にマウントしたまま**背景に回す設計（現状の canvas⇄notes 切り替えと同じ z-index+pointer-events 方式）にするなら、`scope` もインスタンスごとに持つか、「どのタブが現在アクティブか」を外から一元的に教える仕組みが必要です。

## 4. `ui/io.js`（永続化・自動保存）が単一マップ前提のsingleton

`currentRoot`/`currentSvgNode`/`currentMapId`/`currentMapUuid`/`autoSaveTimeout`/`saveInFlight` は全てこのファイルのモジュールレベル変数です。複数タブがそれぞれ独立に自動保存する必要があるなら、**タブごとに独立した io state** が必要です（`instance.js` の他のモジュール群と同じファクトリ化が必要）。今のままだとタブBの編集がタブAの保存状態を上書きします。

## 5. `store.js` のアプリ状態が単一canvas前提

`currentMapId`/`currentMapUuid`/`currentTitle`/`saveStatus`/`dirtyVersion`/`titleAuto` などは全部「今開いているマップは1つ」という前提の signal です。UIパネル（`RightPanel.jsx` の保存ステータスドットなど）はこれを直接読んでいるので、複数タブ化するなら「タブごとの状態」＋「アクティブタブの状態をUIに映す」という二層構造が必要です。

## 6. マウント/アンマウント戦略：今はルート切り替え＝フルリマウント

`Workspace.jsx` は `canvasKey`（`params.uuid` ベース）で `<Show keyed>` を使っており、マップを切り替えると **前のマップの `MindMapCanvas` は完全にアンマウントされ、サーバから再読込**されます（`docs/architecture.md` の設計判断通り、これは意図的）。

「タブを自由に切り替える」体験（スクロール位置・選択・undo履歴を保持したまま戻れる）を実現するには、複数の `<MindMapView>`（または `NewMindMapPreview` 相当）を**同時にマウントしたまま**、notes⇄canvas と同じ「display:none を使わず z-index + pointer-events だけで前面/背面を切り替える」方式にする必要があります。今の uuid キー方式のままでは、タブという概念そのものが存在しません。

## 7. ノートエディタが「1インスタンスしかない」前提

`ui/notes.js` 自身のコメントに明記されている通り: 「assume there is exactly one notes pane... revisit if multiple canvases are ever mounted simultaneously」。マルチタブ化すると、この前提が崩れます。`02-plan.md`/`01-plan.md` の合意では notes 機能自体はライブラリのスコープ外（ホストアプリの薄い外付け機能）とされているので、タブごとに独立させるか、「アクティブタブの内容を映す1枚のエディタ」のままにするかを設計判断する必要があります（後者ならタブ機能に影響しない）。

## 8. タブそのものの管理者（`tabs.js`）がまだ存在しない

`01-plan.md` のロードマップは意図的に「タブUIは最後」としており、`tabs.js`（開いているインスタンスの一覧とアクティブ切り替え）はまだ実装されていません。上記1〜7が片付いた後で:

```js
// 新規: 開いているタブ（uuid -> createMindMap() instance）のレジストリ
const [tabs, setTabs] = createSignal(new Map());
const [activeTabId, setActiveTabId] = createSignal(null);
```

のようなapp側の薄いモジュールが必要です。ライブラリ側の独立性（Step 1〜4）が正しく保たれていれば、ここは本当に薄いコードで済むはずというのが `01-plan.md` の見立てです。

---

### まとめ：優先順位

1. **`newClipboard.js` の「アクティブなインスタンスだけがdocumentリスナーを持つ」ブローカー化**（複数タブ同時マウント時に必須、後回しにすると壊れたまま気づきにくい）
2. **`engineInstance.js` を Context 経由の複数インスタンス対応に変更**（`02-plan.md` の核心）
3. **`ui/io.js` のインスタンス化**（history/itemSelection と同じファクトリパターンを踏襲）
4. **Workspace.jsx のマウント戦略を「同時マウント＋表示切替」に変更**
5. **`tabs.js` の新規実装**

この順番なら、`instance.js` の既存資産（history/selection/viewport/actions/edit/clipboard/mouse 各々のファクトリ化）をほぼそのまま活かせます。
