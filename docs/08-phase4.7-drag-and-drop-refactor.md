# doc08 Phase 4.7 細分化計画（ドラッグ&ドロップのdomRefs移植）

`docs/08-phase4-mindmap-engine-refactor.md`のPhase 4.7は「リスク中〜高」
と評価されている。他のサブフェーズと同じ運用方針（1コミット=1つの独立
して確認できる変更）に従い、4段階に分割する。

## Non-goals（このドキュメント全体を通して）

- ドロップ判定アルゴリズム自体（`docs/07-drop-target-detection-refactor.md`
  で確定した「append zone = targetのcontent rect、それ以外はsibling」
  という設計）は変更しない。移植するのは取得元（`item.dom` →
  `domRefs`）だけ。
- タッチ/ペン対応、Pointer Events統一などは引き続きスコープ外
  （`docs/07-mouse-refactor.md`は不採用のまま）。

## Stage 4.7.1 — append/sibling判定ロジックの純粋関数抽出（リスク: 低）

`mouse.js`の`computeDragState()`のうち、targetのrectが既に分かっている
前提で「append/siblingのどちらか、siblingならどちら向きか」を決める
部分は、`item.dom`に一切依存しない（rectと`childDirection`が引数として
渡されれば計算できる）。この部分だけを`dragPlacement.js`という新しい
DOM非依存モジュールに切り出す。

- `isDraggedAncestor(target, draggedItems)`: ドラッグ中のアイテム自身
  またはその子孫へのドロップを拒否する既存のツリー走査をそのまま移す。
- `decideDropPlacement({ point, target, targetRect, dx, dy, draggedItems })`:
  ルート判定・content rect内判定・軸方向判定を、旧`computeDragState()`
  と全く同じ順序・同じ計算式でそのまま移す。
- `mouse.js`の`computeDragState()`自身は、`getStableDropCollision()`で
  targetを決定し、`getContentRect(target)`でrectを取得したあと、この
  純粋関数を呼ぶだけの薄い関数にする。

この段階では**旧エンジンの挙動は一切変えない**（既存の`mouse.test.js`
がそのまま通ることが確認基準）。新エンジン側はまだ何も変更しない。

## Stage 4.7.2 — `domRefs`ベースのrect取得・ドラッグゴースト（リスク: 中）

新エンジン用の`newMouse.js`に、`domRefs.get(item.id)`から
`getBoundingClientRect()`を取る`getContentRectFor(domRefs, item)`を追加
する。`buildGhost()`/`visualizeDragState()`相当の命令的DOM操作も同様に
`domRefs`経由に書き換えて移植する（Solidコンポーネント化はしない、
`mouse.js`と同じ命令的コードのまま）。

この段階ではまだ実際の`mousedown`/`mousemove`イベントには繋がない。
単体テストで「domRefsに登録されたスタブ要素から正しいghost/rectが
作れること」だけを確認する。

## Stage 4.7.3 — イベント配線・action統合（リスク: 中〜高）

`mousedown`/`mousemove`/`mouseup`を新エンジンのport要素に配線し、
`getStableDropCollision()`相当（`elementFromPoint`優先探索＋
`domRefs`の逆引きMapによるitem解決＋ヒステリシス）を実装する。
確定したドロップは`newAction.js`の`MoveItem`/`Multi`で`action()`に
渡す（`history.js`と統合済みのため、undo/redoも自動的に効く）。

`isCanvasActive()`ガード、post-dragクリック抑制
（`current.suppressNextClick`相当）も移植する。

## Stage 4.7.4 — テスト移植・回帰チェックリスト（リスク: 低〜中）

`mouse.test.js`の該当シナリオ（`elementFromPoint`優先探索、sticky
collision、post-dragクリック抑制）を`domRefs`ベースの新実装向けに
移植する。doc08 Phase 0/3.5の計測パターンを流用し、大量ノードでの
ドラッグが局所再計算を壊していないかも確認する。

## フェーズ一覧

| Stage | 内容 | リスク | 依存 |
|---|---|---|---|
| 4.7.1 | append/sibling判定の純粋関数抽出（旧エンジンのみ、挙動不変） | 低 | — |
| 4.7.2 | domRefsベースのrect取得・ゴースト構築（新エンジン、未配線） | 中 | 4.1, 4.7.1 |
| 4.7.3 | イベント配線・要素逆引き・action統合 | 中〜高 | 4.6, 4.7.2 |
| 4.7.4 | テスト移植・回帰チェックリスト | 低〜中 | 4.7.3 |

各段階は独立してコミット/検証してから次に進む（doc01以来の運用方針）。
