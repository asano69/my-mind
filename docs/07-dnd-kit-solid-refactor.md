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

### Phase 5 progress note

Implemented as planned, with one simplification worth calling out:
`layout/map.js`'s `MapLayout.getChildDirection` no longer counts
siblings to auto-balance an unset `side` -- it now just returns
`child.side || "right"`. The old auto-balance code was removed entirely
rather than kept as a fallback, since dnd-kit's own
`"<rootId>:left"`/`"<rootId>:right"` groups (see
`dnd/sortableTree.js`'s `rootGroupId()`/`syncRootChildren()`) are now the
single source of truth for where a root child renders. A freshly
inserted root child (via `InsertSibling`/`InsertChild`, not drag-and-drop)
therefore defaults to the right side until explicitly moved -- this is
the same simplification the plan anticipated ("自動バランシングの推測
コードが丸ごと不要になる"), not an oversight.

`dnd/sortableTree.js`'s `handleDragEnd` and `buildItemsByGroup` both
special-case root's two groups: `buildItemsByGroup` emits
`"<rootId>:left"`/`"<rootId>:right"` arrays instead of a `root.id` entry,
and `handleDragEnd` maps a resulting group id back to `{ newParent: root,
newSide: "left" | "right" }` when it matches one of those two ids. The
childless-root drop case (`emptyParentId === root.id`) has no existing
sibling to infer a side from, so it keeps the dragged item's current
`side` if it has one, or defaults to `"right"` -- same default as
`getChildDirection`.

`init()`'s effect now also reads every root child's `_sideVersion()`
(not just root's `_childrenVersion()`), so the `SetSide` command
(Ctrl+Left/Right) -- which does not touch `_childrenVersion` -- still
re-syncs which dnd-kit group a child belongs to. This effect can no
longer use `on()` with a fixed dependency, since the set of children
signals it reads is itself dynamic; it is a plain `createEffect` instead,
relying on Solid's normal automatic dependency tracking.



## Phase6

`useSortable`は本来「flexboxやgridで並んでいるリスト」を前提にしていて、ドラッグ中に他の要素へホバーすると、**dnd-kit自身がgetBoundingClientRectの差分からCSS transformを計算し、周囲の兄弟要素をリアルタイムに「押しのけて見せる」**（いわゆるFLIP風のライブプレビュー）機能を標準で持っています。

一方このマインドマップは、兄弟の位置が`GraphLayout`/`TreeLayout`/`MapLayout`の幾何計算（`item.js`の`_writeOwnLayout`が`resolvedLayout.update(this)`を呼ぶ）によって決まる、SVGの`transform="translate(...)"`属性ベースのグラフ状レイアウトです。「flexboxの押しのけ」という前提がそもそも成立しません。さらに、`content`はforeignObject内のdivで、その祖先の`<g>`要素自体もSVG座標変換を持っているため、dnd-kitが計算するCSS transformとSVGのtransform属性が二重に効いて、意図しない位置にズレる・チラつく、という現象が起きやすくなります。

なので「見た目の仕上げ」と一括りにせず、**まず"dnd-kitのライブプレビュー機能を殺す"作業を独立させる**ことが重要です。

## Phase 6 分割計画

| Sub-phase | 内容 | 目的 |
|---|---|---|
| **6.1** | `mouse.js`から旧ドラッグ関連コードを削除（衝突除去のみ、必須） | 二重発火・二重ゴーストの解消 |
| **6.2** | `useSortable`の`feedback`/`optimistic`設定を検証し、**ライブ並び替えプレビューを無効化**する | SVGの乱れの直接原因を断つ |
| **6.3** | ドラッグ中の視覚表現（フローティングゴースト）を、SVGの外側の独立したHTML要素として再実装する | 現状の`buildGhost`と同等の見た目を、SVGのtransformと干渉しない形で再現 |
| **6.4** | ドラッグ中に`item.js`の`_layoutResult`ツリーが**一切再計算されない**ことを確認する回帰チェック | 「ドロップするまでは実データも実レイアウトも動かさない」という前提の検証 |
| **6.5** | ドロップ先を示す簡易的なハイライト（transformを使わない、単なるCSSクラス切り替え）を再実装 | 旧`visualizeDragState`相当の"ここに入ります"表示を、乱れの原因にならない形で復活 |
| **6.6** | タッチ・モバイルでの動作確認（長押し起動、スクロールとの共存、ピンチズームとの共存） | Phase 7で予定していたモバイル確認をここに前倒し統合 |
| **6.7** | 回帰チェックリスト・不要コード最終削除 | 仕上げ |

### 各段階の詳細方針

**6.1（必須・前回説明済み）**
`onDragStart`/`onDragMove`の`drag`分岐、`buildGhost`/`moveGhost`/`computeDragState`系関数、`finishDragDrop`を削除。パン・ピンチ・クリック選択は温存。

**6.2（今回の懸念に直接対応）**
`useSortable`のオプションを調べ、ライブプレビュー（ドラッグ中に他要素をtransformで動かす挙動）を止める設定を探す。具体的には`@dnd-kit/solid/sortable`の`feedback`/`animateTransform`相当のオプション、または`Feedback.configure({ feedback: 'clone' })`のようなプラグイン設定で「実要素は動かさず、クローンだけが追従する」モードに固定できるか確認する。**もし標準APIで完全に止められない場合は、6.3のカスタムオーバーレイに全面的に置き換えて、`useSortable`側のvisual機構自体を使わない**という判断もこの段階でしてよい（既存の`docs/`の中断条件と同じ考え方：効果が出ない/複雑さに見合わないなら差し戻す）。

**6.3**
現状の`buildGhost`（`content`をcloneNodeしてport配下にabsolute配置）をほぼそのまま踏襲し、dnd-kitの`onDragStart`/`onDragMove`イベント（`event.operation`の座標）を使って自前で追従させる。SVGのtransformスタックと完全に独立させることが目的。

**6.4**
`item._childrenVersion`や`_sideVersion`が、ドロップ前（`onDragOver`中）には一切bumpされていないことをテストで確認する。これにより「実データもレイアウトもドロップの瞬間まで不変」という前提が壊れていないことを保証する。

**6.5**
6.2で殺した機能の代替として、「今ホバー中の親/兄弟位置」を示すハイライトを、`item.dom.content.style.boxShadow`のような**transformを使わない**プロパティで表現する（旧`visualizeDragState`の発想をそのまま復活。transformではなくbox-shadowなので、SVGのtransform属性とは干渉しない）。

**6.6・6.7**
既存のPhase 7予定を吸収。

## 提案

まず**6.1と6.2をセットで**実行するのが良いと思います。6.2で「ライブプレビューを無効化できるか」を確認しないと、6.1だけ終えても結局SVGの乱れが残るためです。6.3以降（見た目の仕上げ）は動作確認しながら後回しでも問題ありません。

