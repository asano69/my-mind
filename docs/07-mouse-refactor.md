# ドロップターゲット判定改善計画（子ノードへのドロップを容易にする）

## この計画の目的

- マウスでノードをドラッグしたときの、ドロップ先判定――特に「あるノードの子として追加する」操作――が現状厳しすぎるという使い勝手上の課題を解消する。
- 旧 `07-mouse-refactor.md`（Pointer Events統一・状態機械・Edge auto-scroll等）は未着手のまま、本ドキュメントで置き換える。それらは今回の目的に直接寄与しないため、スコープから外す。
- 参考にするのは `mind-elixir-core`（`src/plugin/nodeDraggable.ts` の `handleNodeDragMove`）が採用している「ノード本体の大部分は子として追加、上下端のごく薄い帯だけが兄弟挿入（前/後）」という当たり判定モデル。ただしmy-mindはマウスのみ対応でよく、`mind-elixir-core` のタッチ/ペン向けの分岐（ロングプレス、ピンチ等）は移植しない。

## 背景・現状の課題

現在の `mouse.js` の `computeDragState()` は、ドロップ先候補ノード（`target`）の中心からの距離 `dx`/`dy` が、ドラッグ中アイテムとtargetの大きい方のサイズ `w`/`h` 未満なら「append（子として追加）」、それ以外は「sibling（兄弟として挿入、方向つき）」と判定している。

図形的には「targetを中心とした、ノードそのものよりやや大きい矩形」がappendの当たり判定になっている。理屈の上では広く見えるが、実際に触ると次の理由で子への追加がしにくい:

- グラフレイアウト（`graph-*`）やツリーレイアウトでは兄弟ノードが縦方向（targetによっては横方向）に密に並ぶため、兄弟が並ぶ軸方向の許容量が兄弟間の間隔に比べて相対的に狭くなりやすく、少し縦（または横）にずれただけでsibling判定に落ちる。
- `getStableDropCollision` のヒステリシス（`DROP_TARGET_STICKY_PADDING`）は「同じtargetに留まり続けやすくする」ためのものであり、「targetの中でappendとsiblingのどちらになりやすいか」というモデル自体は変えない。

結果として、ユーザーがtargetの上に十分乗せているつもりでも、appendではなくsiblingとして反応してしまう場面が多い。

## `mind-elixir-core` から借りる考え方

`src/plugin/nodeDraggable.ts` の `handleNodeDragMove` は次のモデルを採用している:

- ノードの上下端からごく薄いしきい値（`12 * scaleVal` 程度、ズームに応じた画面px換算）だけを「兄弟挿入帯」とする。
- それ以外の、ノード本体のほとんどの領域は「子として追加（`in`）」になる。
- 判定は、カーソル位置そのものではなく、カーソルから閾値だけ上/下にオフセットした点で `elementFromPoint` し、見つかった要素の矩形とカーソルの位置関係から「その要素の外（上/下）に出ているかどうか」を見ている。

この「appendが広く、sibling挿入が端のごく薄い帯」という比率をmy-mindにも取り入れる。ただし実装は素直に「targetのcontentSize基準で、兄弟挿入の軸方向にのみ端のマージンを取る」形にし、`elementFromPoint` を二度呼ぶような込み入ったテクニックは持ち込まない（CLAUDE.mdのシンプルさ優先の方針に合わせる）。

## Non-goals

- Pointer Events（`pointerdown`/`pointermove`/`pointerup`）への統一は行わない。既存の `mousedown`/`mousemove`/`mouseup` のままでよい。
- タッチ・ペン対応（ピンチズーム、長押しコンテキストメニュー等）はスコープ外。現状の分岐はそのまま残す。
- Edge auto-scroll（画面端に近づいたら自動パンする機能）の追加は行わない。
- 明示的な状態機械（`State` 定数化）への置き換えは行わない。`current.mode` の文字列ベースの実装のままでよい。
- ドロップ先の探索アルゴリズム自体（`getStableDropCollision`、`elementFromPoint` 優先＋距離ベースのフォールバック、ヒステリシス）は変更しない。変更するのは「targetが決まったあとに、append/siblingのどちらにするか」の判定だけ。
- `MapLayout` のルート直下（左右分岐）のドロップ挙動は変更しない（`target.isRoot` は引き続き常にappend）。

## 設計方針: 端マージン方式

`computeDragState()` 内の、targetが決まった後の判定を次のように変える。

- 兄弟挿入の方向軸（`childDirection` が `"left"`/`"right"` なら縦方向、`"top"`/`"bottom"` なら横方向 — 現状のコードと同じ判定に合わせる）を求める。
- その軸方向について、targetのcontentSize（縦方向なら`h`、横方向なら`w`）に対する割合でマージンを決める。
- カーソルがtargetの中心から、その軸方向に「`軸サイズ/2 - マージン`」を超えて離れている場合だけsibling（方向は現状通り符号で決定）。それ以外（マージンの内側、つまりtargetの大部分）はappend。
- 交差軸（兄弟が並ばない方向）の距離チェックは、現状の「ノードから大きく外れたらappendではなくなる」という保険的な役割のためだけに、緩めの値（現状の`w`/`h`判定をそのまま流用）を残す。ここを厳しくすると同じ問題が再発するため、意図的に緩く保つ。

```js
// mouse.js — the sibling-insert zone becomes a thin margin along the
// layout's child axis, near-mirroring mind-elixir-core's nodeDraggable.ts
// (a small edge band means before/after, everything else means append).
// Only the axis used for sibling ordering gets a strict margin; the cross
// axis keeps the existing generous allowance so append stays easy to hit.
const EDGE_MARGIN_RATIO = 0.2;
const EDGE_MARGIN_MIN_PX = 10;

function edgeMargin(axisSize) {
  return Math.max(axisSize * EDGE_MARGIN_RATIO, EDGE_MARGIN_MIN_PX);
}
```

`computeDragState()` の書き換えイメージ（設計意図を示す疑似コード。実装時は既存の変数名・重複呼び出しの整理に合わせる）:

```js
// mouse.js — computeDragState(), axis-margin version
const childDirection = target.parent.resolvedLayout.getChildDirection(target);
const isVerticalSiblings = childDirection == "left" || childDirection == "right";
const axisSize = isVerticalSiblings ? targetContentSize[1] : targetContentSize[0];
const axisDist = isVerticalSiblings ? closest.dy : closest.dx;
const crossDist = isVerticalSiblings ? closest.dx : closest.dy;
const crossSize = isVerticalSiblings
  ? Math.max(itemContentSize[0], targetContentSize[0])
  : Math.max(itemContentSize[1], targetContentSize[1]);

if (target.isRoot) {
  state.result = "append";
} else if (Math.abs(axisDist) < axisSize / 2 - edgeMargin(axisSize) && Math.abs(crossDist) < crossSize) {
  state.result = "append";
} else {
  state.result = "sibling";
  state.direction = isVerticalSiblings
    ? (axisDist < 0 ? "bottom" : "top")
    : (axisDist < 0 ? "right" : "left");
}
```

### なぜ軸方向だけマージンを取るのか

- 兄弟として挿入する操作は「targetの直前/直後」という1次元の順序操作なので、しきい値は本質的に兄弟が並ぶ1軸だけで十分。
- 交差軸まで厳しくすると、カーソルが少し斜めにずれただけでappendが効かなくなり、現状と同じ問題を再発させる。したがって交差軸は現状の緩い判定をそのまま残す。

## フェーズ計画

### Phase 0 — 現状の特性化とテスト土台

- `mouse.test.js` に、現状の `computeDragState()` 相当のロジック（`finishDragDrop` が呼ばれる際の `result`）を確認する回帰テストがまだ薄いことを確認する。
- 3階層程度のツリー（root → middle(複数) → leaf）を使い、「targetのほぼ中央にカーソルがあるのにsibling判定になるケース」を再現するテストケースを洗い出す。テストは既存の `frontend/src/lib/mindmap/mouse.test.js` のDOM-freeモックパターン（`contentNode()` ヘルパー等）を踏襲する。
- 「現状、targetの中心から兄弟軸方向にどれだけ離れるとsiblingに切り替わるか」を記録し、Phase 2の変更後と比較できるようにする。

リスク: なし。

### Phase 1 — 失敗する回帰テストを先に書く

CLAUDE.mdの「バグ修正の前に失敗する回帰テストを書く」方針に従う。

- 「targetの兄弟軸方向のマージン内（例: 軸サイズの中心から40%以内）にカーソルがある場合は常にappendになる」ことを期待するテストを追加する。現状の実装のままなので、意図的に失敗させる。
- 「targetの兄弟軸方向の端（例: 軸サイズの90%以上離れた位置）にカーソルがある場合はsiblingになる」ことを期待するテストも追加する（こちらは現状でも成立するはずなので、退行防止用に先に緑にしておく）。

リスク: なし（テスト追加のみ）。

### Phase 2 — 判定ロジックの実装

- `computeDragState()` 内のappend/sibling判定を、上記の軸方向マージン方式に置き換える。
- `EDGE_MARGIN_RATIO`/`EDGE_MARGIN_MIN_PX` は `mouse.js` の先頭にモジュール定数として置く（`PINCH_THRESHOLD` 等、既存の定数群と同じ並び）。
- Phase 1で追加したテストが通ることを確認する。

リスク: 中。境界値（ちょうどマージンの境目にカーソルがある場合）の単体テストも足しておくと、後々の調整がしやすい。

### Phase 3 — 手動確認とパラメータ調整

- グラフレイアウト（`graph-right` 等）、ツリーレイアウト（`tree-right` 等）、マップレイアウト（ルート直下）のそれぞれで、子への追加・兄弟挿入の双方が自然に行えるか確認する。
- `EDGE_MARGIN_RATIO`/`EDGE_MARGIN_MIN_PX` の値は実際に触った感触で調整してよい（初期値は目安であり固定値ではない）。
- 子が5個以上など密に並んだノードでも、appendの当たり判定が広すぎて意図しない子への挿入が頻発しないか（広げすぎの逆方向の問題）も確認する。

リスク: 低。パラメータ調整のみで、ロジック自体の変更はPhase 2で完了している。

### Phase 4 — 後片付け・回帰チェックリスト

- `DROP_TARGET_STICKY_PADDING` や `getStableDropCollision` など、今回変更しなかった部分に副作用がないか再確認する（ヒステリシスは「どのtargetを選ぶか」の話であり、「選ばれたtargetに対してappendかsiblingか」を決める今回の変更とは独立しているはずだが、念のため一緒に動かして確認する）。
- 回帰チェックリスト:
  - 既存の `mouse.test.js` のテスト（フォーカスハンドオフ、post-dragクリック抑制、`elementFromPoint` 優先のヒットテストなど）がすべて通る。
  - 子として追加したいケース・兄弟として挿入したいケースの両方が、体感として現状より迷わず行える。
  - ルート直下（左右分岐）のドラッグ&ドロップは従来通り。
  - Undo/Redoで、ドラッグによる `MoveItem` アクションが従来通り記録・復元される。
- 本ドキュメントは今回のスコープで完結とし、Pointer Events統一やEdge auto-scroll等の別方向の改善が将来必要になった場合は、別ドキュメントとして新規に起こす。

リスク: なし（整理・検証のみ）。

## フェーズ一覧

| Phase | 内容 | リスク | 依存 |
|---|---|---|---|
| 0 | 現状の特性化 | なし | — |
| 1 | 失敗する回帰テストを先に書く | なし | Phase 0 |
| 2 | 軸方向マージン方式の実装 | 中 | Phase 1 |
| 3 | 手動確認とパラメータ調整 | 低 | Phase 2 |
| 4 | 後片付け・回帰チェックリスト | なし | Phase 3 |

各フェーズは1コミット/PRとして独立させ、動作確認してから次に進む（`docs/01-mindmap-state-refactor.md` 等と同じ運用方針）。