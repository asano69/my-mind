# 現状の `mouse.js` の何が課題か、`nodeDraggable.ts` から何を借りるか

まず整理すると、dnd-kitが失敗した理由は「ライブラリが**兄弟要素をCSS transformで動かすFLIP風プレビュー**を持っていて、SVGの`transform="translate(...)"`ベースのレイアウトと二重に干渉した」ことでした。

`nodeDraggable.ts`は根本的に違う設計です。**ライブラリではなく、状態機械 + ゴースト要素 + `elementFromPoint`による当たり判定**という、今の`mouse.js`と同じ骨格の延長線上にあります。なので今回は「別ライブラリの導入」ではなく「今のコードを同じ思想のまま洗練する」リファクタになり、dnd-kitのときのような構造的リスクは基本的にありません。

具体的に借りられる改善点：

| nodeDraggable.tsのパターン | 今のmouse.jsの対応部分 | 改善点 |
|---|---|---|
| Pointer Events統一 (`pointerdown/move/up/cancel`) | `mousedown`/`touchstart`を別々に処理 | タッチ・マウス・ペンを1つの経路に統合、`touches`の分岐が消える |
| 明示的な状態機械 (`Idle/DragWait/Drag/Pan/Pinch`) | `current.mode`という文字列を都度書き換え | 状態遷移が一箇所に集約され、「今どの状態か」が追いやすくなる |
| `EdgeMoveController`（境界に近づくと自動スクロール） | 存在しない | ドラッグ中に画面端でキャンバスが自動パンする新機能 |
| 長押し(`longPressHelper`)でタッチのドラッグ開始を判定 | `touchContextTimeout`で似た役割だが独立実装 | 「動いたらキャンセル」の閾値判定が明確化される |
| ドロップ位置判定が cursor位置 vs `getBoundingClientRect()` の閾値ベース | 既存の`computeDragState`とほぼ同じ発想 | 大きな変更は不要、現状維持でよい部分 |

つまり**全面書き換えではなく「同じ設計のまま、状態機械とPointer Eventsに寄せる」**リファクタです。CLAUDE.mdの「シンプルさ最優先」「小さく刻む」に沿って、段階分割します。

---

## フェーズ計画（案）

### Phase 0 — 現状の特性化（コード変更なし）
- 今の`mouse.js`の`current`オブジェクトが実際に取りうる状態の組み合わせを書き出す（`mode: "" | "pan" | "drag" | "pinch"`、`ghost`の有無、等）。
- 既存の`mouse.test.js`が今のどの挙動をカバーしているか確認し、Phase 1以降で壊れやすい箇所（フォーカスハンドオフ、post-dragクリック抑制など）に回帰テストが既にあることを確認する。

リスク: なし。

### Phase 1 — Pointer Eventsへの統一（当たり判定・状態はそのまま）
- `touchstart`/`mousedown`/`mousemove`/`mouseup`/`touchmove`/`touchend`のリスナーを`pointerdown`/`pointermove`/`pointerup`/`pointercancel`に置き換える。
- `eventToPoint()`の`"touches" in e`分岐が不要になり、`e.clientX`/`e.clientY`に一本化できる。
- `setPointerCapture`/`releasePointerCapture`を使うことで、指の位置を追跡し続けるための`document`.
