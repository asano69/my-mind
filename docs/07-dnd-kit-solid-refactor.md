現在のマインドマップのノードの移動が、複雑な上に、うなく機能しない。
@dnd-kit/solid で、移動部分を書き換えて、スマホでも対応できるようにリファクタリングしたい。

- `@dnd-kit/solid`は実在します。ただし旧来の`@dnd-kit/core`（React専用、v6系）とは別系統で、`@dnd-kit/dom` + `@dnd-kit/abstract`を土台にした新世代（v0.5系）のSolid公式アダプタです。`npm install @dnd-kit/solid @dnd-kit/dom @dnd-kit/abstract`が必要です。
- `useSortable`は`group`プロパティを持ち、これが「Multiple Sortable Lists」の実装単位になります。同じ`group`に属するidどうしの間で並び替え・別グループへの移動が標準サポートされます。
- ビジュアルの補助には`@dnd-kit/helpers`の`move()`関数が使えます（配列 + ドラッグイベントから新しい配列を返す）。

つまり構想自体は成立します。ただし**そのまま「1個のsortableリスト」には収まらない**点が、このコードベース固有の難所です。以下で整理します。

## なぜ今のmouse.jsが複雑で壊れやすいのか

- `onDragStart`/`onDragMove`/`onDragEnd`が、ノードのドラッグ・キャンバスのパン・ピンチズームの3役を1つのmousedown/touchstartハンドラで兼務している。
- `computeDragState()`が「append」か「sibling」かを`content`の`getBoundingClientRect()`との距離ヒューリスティックで判定している（`w`/`h`との比較）。これは兄弟間への正確な挿入を保証しない。
- ゴースト要素の位置計算がport基準の座標変換を手で行っている（`portRect.left`を引く等）。
- タッチは`touchstart`→`TOUCH_DELAY`後にコンテキストメニューを開く、という別ロジックが同じ状態機械に混ざっている。

これらはすべて、dnd-kitの`PointerSensor`/センサー抽象化・`collision detection`・`DragOverlay`が肩代わりできる領域です。

## データモデルをどうdnd-kitに合わせるか（最重要ポイント）

`item.children`は木構造で、各`Item`は「親から見た1要素」でありながら「自分の子リストの親」でもあります。これをdnd-kitの`group`にそのまま対応させます。

- **各Itemの`id`をそのまま、そのItemの"子リストのgroup id"として使う。**
  - `parent`の子である`item`は `useSortable({ id: item.id, group: parent.id, accept: "item", type: "item", index })` で表現する。
  - 兄弟間へ挿入する操作は、同じ`group`（＝同じ親）内でのindex移動になる。これがまさに「Multiple Sortable Lists」がそのまま使える部分。
  - 別の親の子になる（親を跨ぐ移動）操作は、`group`を跨ぐ移動になる。dnd-kit側が標準サポート。

- **「子が0個のノードに最初の子としてドロップする」操作**は、そのgroupにまだitemが1つも無いため、sortableの当たり判定だけでは拾えません。ノード自身に`useDroppable({ id: `${item.id}:empty`, group: item.id, accept: "item" })`を追加し、子が空のときだけ有効化する必要があります（既存の`computeDragState`の"append"ケースの正式版）。

- **ルートだけ特殊**（`MapLayout`が左右2方向を持つ）なので、rootの子は`group`を`"root:left"`/`"root:right"`の2つに分けます。現状`_setSide`が「兄弟の数を数えて自動的に左右振り分け」をしていますが、これはドロップ先のgroupがそのまま`side`を決めてくれるので、**むしろロジックが単純化されます**（自動バランシングの推測コードが丸ごと不要になる）。

## SVGであることの扱い

dnd-kitはDOM要素にrefを貼るだけなので、対象が`<div class="content">`（foreignObject内）であること自体は問題になりません。ただし：

- ドラッグ中の視覚表現（現状の`buildGhost`/`moveGhost`）は、SVG座標系の外、`DragOverlay`相当の普通のHTML要素として浮かせる方が確実です（今のコードもcloneNodeをport配下のabsolute要素として浮かせているので、発想は同じ）。
- `toggle`（折りたたみボタン）やconnector（`<path>`）はドラッグ対象に含めない。

## Undo/Redoとの接続

幸い、実際のツリー変更は`action.js`の`MoveItem`（`do()`/`undo()`）に既に集約されています。dnd-kit側は「どのidがどのgroup・indexに移動したか」を`onDragEnd`で返すだけにして、実際の適用は今まで通り

```js
app.action(new actions.MoveItem(item, newParent, newIndex, newSide));
```

に委譲すれば、history.js（undo/redo）は無改造で済みます。ここは既存設計の良い部分なので温存します。

## 段階的リファクタ計画（案）

| Phase | 内容 | リスク |
|---|---|---|
| 0 | 現状の不具合を明文化（「兄弟間挿入が不正確」「タッチで動かない」等）、依存追加のみ | なし |
| 1 | `DragDropProvider`導入。既存`mouse.js`のドラッグ部分はまだ並存させ、パン/ピンチだけ先に分離しておく | 低 |
| 2 | 単一の親の子リストだけ`useSortable`化（`group = 固定の親1個`）。appendのみ、sibling挿入はまだ未対応の状態で動作確認 | 中 |
| 3 | `group = parent.id`に一般化。親を跨ぐ移動も含めたMultiple Sortable Lists化。ここで初めて「ノード間への正確な挿入」が標準対応になる | 中 |
| 4 | 子が空のノードへの`useDroppable`（`${id}:empty`）を追加 | 低〜中 |
| 5 | rootの`"root:left"`/`"root:right"`2グループ対応。`_setSide`の自動振り分けロジックを削除しドロップ先groupに置き換え | 中 |
| 6 | 旧`computeDragState`/`visualizeDragState`/`buildGhost`/`getStableDropCollision`等を削除し、`DragOverlay`＋dnd-kitのcollision detectionに置き換え | 高（見た目の最終確認が必要） |
| 7 | タッチセンサー確認：スマホでのドラッグ開始判定・スクロールとの共存・既存pinch-zoomとの共存 | 中 |
| 8 | 回帰チェックリスト（undo/redo、multi-selection中のドラッグ、collapsed親への挿入、既存の`docs/`にある回帰観点を流用） | — |
