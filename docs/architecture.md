# マインドマップエンジン アーキテクチャ

## この文書について

`docs/01-mindmap-state-refactor.md` 〜 `docs/08-*-mindmap-engine-refactor.md`
（doc01〜doc08、その派生ドキュメント全て）は、pubsub ベースの命令的エンジン
（`item.js`/`my-mind.js`/`map.js`/`mouse.js`/`keyboard.js`/`clipboard.js`/
`command/*.js`）から、Solid.js が SVG ツリーそのものを所有する宣言的エンジン
（`itemStore.js`・`new*.js`・`NewMindMapPreview.jsx`）へ段階的に移行するための
計画書だった。この移行は `docs/08-phase6-mindmap-engine-refactor.md` をもって
完了し、旧エンジンのファイルは全て削除された。

そのため、doc01〜08 に書かれていた「次に何をどう移すか」という手順の大部分は
もはや意味を持たない（存在しないファイルへの参照ばかりになる）。しかし、その
過程で確定した**設計判断とその理由**は、今のコードベース（`itemStore.js` の
`layoutResult`、`store.js` のシグナル設計、`newMouse.js`/`newClipboard.js` の
実装方針など）にそのまま生きており、今後同じ議論を繰り返さないために残す価値
がある。この文書はその部分だけを抽出し、1本にまとめ直したものである。

doc01〜08 の原本はこの文書の作成後に削除される。`docs/d01-clipboard-event-targeting.md`
（doc ではなく d01 = デバッグノート）と `docs/design.md`・`docs/plan.md` は
このリファクタとは別スコープのドキュメントなので対象外、そのまま残る。

---

## 1. データ層 — `ItemNode`（`itemStore.js`）

マインドマップのツリーは、DOM を一切持たないプレーンな reactive データモデル
（`ItemNode`）として表現される。各プロパティ（`text`/`color`/`shape`/`layout`/
`value`/`status`/`collapsed`/`side`/...）は Solid の `createSignal` で、継承・
集約が必要なプロパティ（`resolvedColor`/`resolvedTextColor`/`resolvedShape`/
`resolvedLayout`/`resolvedValue`/`resolvedStatus`）は `createMemo` または
それに準ずる getter で表現する。

旧エンジン時代に頻発した「意味のないバージョンカウンタ」（`_contentVersion`・
`_childrenVersion`・`dirtyVersion`・`layoutVersion` のような、値そのものには
意味がなく「変わった」ことだけを伝えるための signal）は、実データが signal 化
されたことでほぼ不要になった。今も残っている数少ない例（`store.js` の
`dirtyVersion`/`historyVersion`/`notesHistoryVersion`）は、いずれも「そもそも
値を読む側がいない、変化そのものだけが意味を持つ」正当なケースに限定されて
いる。新しいコードでこの種のカウンタを追加したくなったら、まず「実データの
signal を直接読めば済まないか」を先に疑うこと。

## 2. レイアウト計算 — 再帰的 per-item メモチェーン（`layoutResult`）

この移行全体でもっとも重要な設計判断。`ItemNode` の各インスタンスは自分専用の
レイアウト結果メモを持つ:

```js
// itemStore.js の constructor 内、createRoot ブロックの中
this.layoutResult = createMemo(() => this._computeLayout());
```

`_computeLayout()` は、自分のレイアウト（`computeMapLayout`/`computeGraphLayout`/
`computeTreeLayout`、いずれも `layout/*.js` の純粋関数）を計算する過程で、
可視な子それぞれの `child.layoutResult()` を直接呼ぶ。Solid の `createMemo`
は pull-based（遅延評価）なので、子のメモが stale ならその場で同期的に再計算
されてから値が返る。これにより:

- **post-order（子が親より先に確定する）順序が、Solid のエフェクトスケジューラ
  ではなく、素の JavaScript の関数呼び出し順序そのものによって保証される。**
- ノードを1つ変更すると、そのノード自身と祖先のメモだけが再評価される。
  無関係な兄弟ブランチは誰にも読まれないので、Solid のメモ化により完全に
  スキップされる（`itemStore-layout-locality.test.js` で検証済み: 深さ4の
  木で葉の編集は5ノードだけ再計算、無関係な兄弟は0）。

### なぜこの設計にたどり着いたか（却下された案）

- **アイテムごとの独立 `createEffect`/`createComputed`**: 一見 Solid らしいが、
  Solid の複数の独立した computed は同一トランザクション内でバッチ実行される
  だけで、**兄弟間・親子間の実行順序を保証しない**。現行のレイアウトは
  「子のサイズを実測してから親がそれを読む」という post-order 不変条件に強く
  依存しているため、順序が保証されない設計は採用しなかった。
- **手動 dirty フラグ方式**（`markDirty`/`markSubtreeDirty`）: 動作はするが、
  継承プロパティ（color/textColor/shape/layout）だけ下方向にも辿る必要が
  あるという非対称な特別扱いが必要になり、状態管理の種類が増える。
- **JSX コンポーネント側で `createMemo` によりサブツリーを丸ごと計算する案**:
  実際に一度実装され、無限再帰でクラッシュした。原因は「計算」と「副作用
  （signal の書き込み・DOM 書き込み）」を同一 computation のスコープに
  混在させたこと。教訓として、**メモの計算対象を JSX コンポーネント側では
  なく、データモデル（`ItemNode`）自身に持たせる**ことで解決した。

### 厳守すべきルール

`_computeLayout()`（`layoutResult` の中身）は **signal を読むだけ**で、
**signal の書き込みも DOM 操作も絶対に行わない**。実測サイズの書き込み
（`setMeasuredSize()`）は、必ず DOM が実際にコミットされた後、コンポーネント
の `createEffect` からのみ呼ぶ（`NewMindMapPreview.jsx` の `ItemNodeView` を
参照）。この境界を破ると doc08 で経験した無限再帰が再発する。

継承方向（`resolvedColor` 等、子が親を読む）と集約方向（`layoutResult`、
親が子を読む）は完全に独立した2本のメモチェーンとして共存でき、互いに
特別扱いを必要としない。dirty-flag 案にあった「継承プロパティだけ下方向にも
辿る」という非対称性は、この設計では最初から発生しない。

### 非 signal 由来のレイアウトトリガー

- `item.side` は今では普通の signal なので特別扱い不要。
- `contentEditable` でのライブ入力は、対象アイテムの `setMeasuredSize()` を
  明示的に呼んで反映する。
- フォントサイズズームは、実装を調べた結果 `adjustZoom()` は CSS の
  `transform: scale()` のみで行われており、`font-size` 自体は変化しない
  （＝どのアイテムの実測サイズにも影響しない）ことが判明した。「ズームで
  全ノードを dirty にする」という設計は結局実装不要だった。

## 3. Bridge パターンの使い分け

pubsub 時代の名残として、vanilla module（Solid コンポーネントではない
プレーンな JS モジュール）が Solid 側の状態とやり取りする方法は3パターンに
整理された。新しいモジュールを書くときはこの順で検討する:

1. **読むだけでよいなら bridge 不要。** 素直に `store.js`/`itemSelection.js`
   の signal を直接読む（例: `RightPanelProperties.jsx` が `currentItem()`
   を直接読む）。
2. **Solid が持たない DOM ノードへ命令的に値を押し込む必要があるときだけ
   bridge object を使う。** 例: `ui/notes.js` ↔ `NotesEditor.jsx` の
   `registerEditorAPI`（EasyMDE は Solid 外のライブラリで、自分の textarea
   を持っているため）。`title.js` の `document.title` 同期も同様（ブラウザ
   API を触る必要が変わらず残るため）。
3. **vanilla module が signal の変化に反応する必要があるなら、`createRoot`
   + `createEffect` のペアを使い、返ってきた `dispose` をそのモジュール自身
   の `dispose()` から呼ぶ。** Solid コンポーネントの外で作られたエフェクト
   には自動的な owner がいないため、明示的な後始末が必要。

`item.js` の `dom.link` クリックハンドラのような「DOM イベント → app 呼び出し」
のパターンは、新エンジンでは JSX の `onClick` prop 経由の直接呼び出しに
単純化された（これは bridge ではなく、単なる簡略化）。

`pubsub.js` は最終的に完全に削除された。今後、新しい「変更を知らせるだけの
イベント」を作りたくなったら、まず上記1〜3のどれかで表現できないか検討する
こと。

## 4. `domRefs` — 間接 DOM 参照レジストリ

`ItemNode` は DOM 参照を一切持たない。ドラッグ判定（`newMouse.js`）・
テキスト編集（`newEdit.js`）・カット時のビジュアル切り替え（`newClipboard.js`）
のように、どうしても実 DOM 要素が必要な処理は、`Map<item.id, HTMLElement>`
（`domRefs`）を経由して間接参照する。このレジストリは `NewMindMapPreview.jsx`
の `ItemNodeView` が `onMount`/`onCleanup` で登録・解除する。旧エンジンの
`item.dom.content` のような直接参照は存在しない。

## 5. Workspace モード（キャンバス ⇄ ノート）

`store.js` の `activeMode`（`"canvas"` | `"notes"`）という1つの共有 signal で
「キャンバスとノートエディタのどちらが前面か」を表現する。両方とも常時
マウントされたままで、前面/背面の切り替えは **`display:none` を使わず**、
`z-index` + `pointer-events` だけで行う（`display:none` だと CodeMirror や
`foreignObject` がレイアウトを再計算する羽目になるため）。

キーボード・マウス・クリップボードなどエンジン専用のリスナーは、
`scope.js` の `isCanvasActive()` でガードし、ノートが前面にある間は反応
しない。

クリップボード（`newClipboard.js`）だけは特別で、`document` の capture
フェーズで `cut`/`copy`/`paste` をリッスンする。これはコンテナ要素ではなく
`document` を対象にする必要がある。理由は `docs/d01-clipboard-event-targeting.md`
に詳しいが要約すると: `keydown`/`click` はフォーカス（`document.activeElement`）
基準で target が決まるのに対し、`cut`/`copy`/`paste` は現在の Selection の
位置で target が決まり、Selection が無い/コンテナ外にあると target が
`document.body` にフォールバックしてしまう。この非対称性は DOM/ブラウザ
仕様そのものであり、エンジンの実装方式（旧エンジンか新エンジンか）に
関わらず当てはまり続ける。今後 `cut`/`copy`/`paste`/`selectionchange` を
新規に扱う場合は同じパターン（`document` + capture）を踏襲すること。

## 6. ドラッグ&ドロップ — 軸マージン方式（append/sibling 判定）

`dragPlacement.js` の `decideDropPlacement()` が、ドロップ先が「子として
追加（append）」か「兄弟として挿入（sibling）」かを決める。設計方針:

- append ゾーンは target の content rect そのもの。
- そこから外れた場合のみ sibling 挿入になり、方向はレイアウトの軸
  （兄弟が並ぶ方向）のどちら側にカーソルがあるかで決まる。
- 交差軸（兄弟が並ばない方向）の許容量は意図的に緩く保つ。ここを厳しく
  すると「target にカーソルを乗せているつもりでも sibling 判定になる」
  という使い勝手の悪さが再発する。

このロジックは純粋関数として1箇所に切り出されており、`newMouse.js` の
ドラッグ処理から呼ばれる。ドロップ先候補自体の探索（`elementFromPoint`
優先＋距離ベースのフォールバック、`DROP_TARGET_STICKY_PADDING` による
ヒステリシス）とは独立している——「どの target を選ぶか」と「選ばれた
target に対して append か sibling か」は別の関心事として分離されている。

## 7. History / Undo・Redo 設計

`action.js`（現在は `newAction.js` に統合）の `do()`/`undo()` という
Command パターンは、Solid の `createStore` によるスナップショット差分方式へ
書き換えず、**そのまま維持する**という判断がされた。理由:

- 既存のメンタルモデル（Command パターン）と一致している。
- 各アクションが既に自分で自分を逆転する方法を知っている。
- スナップショット差分方式への書き換えは、このリファクタのスコープを
  超える大きな挙動変更になる。

`history.js` 自体はアイテムに依存しないプレーンな undo スタックのままで
よく、変更が必要だったのは各アクションの `do()`/`undo()` が「signal
setter を呼ぶ」ようになっただけ（`item.status = x` のような公開プロパティ
経由の書き込みは、旧エンジンの頃から既にこの形だったため、実質的な変更は
ほぼゼロだった）。

`historyVersion` は「スタックが変わった」ことだけを伝える signal で、
値そのものには意味がない。`canBack()`/`canForward()` は引き続きプレーンな
関数のまま。

## 8. まとめ: 新しいコードを書くときのチェックリスト

- ツリーの新しいプロパティを追加するなら、まず `createSignal` で素直に
  表現できないか考える。バージョンカウンタは最後の手段。
- レイアウトに影響する計算は `ItemNode._computeLayout()` の中に収め、
  signal の書き込みや DOM 操作を紛れ込ませない。DOM 書き込みは必ず
  コンポーネントの `createEffect` 側に置く。
- vanilla module から Solid の状態に触るときは、まず直接 signal を読めない
  か検討し、それでも無理なら bridge object、それでも無理なら
  `createRoot` + `createEffect` を検討する。
- DOM 要素が必要な vanilla module（ドラッグ判定、編集、クリップボード）は
  `item.dom` のような直接参照ではなく、`domRefs` のような間接レジストリを
  経由する。
- `cut`/`copy`/`paste`/`selectionchange` のような Selection ベースの
  イベントは `document` の capture フェーズでリッスンする。
