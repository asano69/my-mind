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

なお、`mouse.js`は、マウス駆動のPointer Events だけを想定したシンプルな実装にすること。
モバイル/ペン/タブレット対応は別途まとめて着手する予定であり、今リファクタを進める上ではノイズにしかならない。


## Non-goals

- `nodeDraggable.ts`の`insertType`（`before`/`after`/`in`）というCSSクラスベースのプレビュー方式への差し替えは**今回は行わない**。理由はPhase 5で述べる。
- 複数キャンバス同時マウントへの対応は`docs/02-workspace-mode-switch-refactor.md`と同様スコープ外。`mouse.js`は現状も`init(port, containerEl)`で1インスタンスに閉じており、そのモデルを維持する。
- `context-menu.js`（右クリック/長押しメニュー）自体の実装は変更しない。`mouse.js`側のイベント発火経路だけがPointer Events化の影響を受ける。
- **タッチ/ペンタブレット対応（ピンチズーム、長押しコンテキストメニュー）は今回スコープ外。** マウスでのドラッグ&ドロップ・パン・ホイールズームだけをシンプルに保守できる形にすることを優先し、タッチ固有のロジックは着手時期が来るまで実装しない（既存のピンチ/長押しコードは削除済み）。

---

## フェーズ計画

### Phase 0 — 現状の特性化（コード変更なし）
- 今の`mouse.js`の`current`オブジェクトが実際に取りうる状態の組み合わせを書き出す（`mode: "" | "pan" | "drag" | "pinch"`、`ghost`の有無、等）。
- 既存の`mouse.test.js`が今のどの挙動をカバーしているか確認し、Phase 1以降で壊れやすい箇所（フォーカスハンドオフ、post-dragクリック抑制など）に回帰テストが既にあることを確認する。
- 現状ドラッグは「移動距離のしきい値」を明示的には持たない点も記録しておく。`onDragStart`で`current.mode`が即座に`"drag"`になり、実際の`buildGhost()`は`onDragMove`の初回呼び出しでのみ発生する。つまり「動いた瞬間に初めてゴーストが生成される」という暗黙のしきい値（=1px移動）が既にあり、これは`onClick`の`current.suppressNextClick`ロジック（ゴーストが存在した場合だけpost-dragクリックを抑制する）とも整合している。Phase 2以降でこの暗黙の不変条件を壊さないよう明記しておく。

リスク: なし。

### Phase 0 progress note

`current`が実際に取りうる状態の組み合わせを洗い出した結果:

- **Idle**: `mode: ""`、`items: []`、`ghost: null`、`previousDragState: null`。`onDragEnd`/`dispose()`後の定常状態。
- **Pan**: `mode: "pan"`。`item`が存在しない（背景クリック）か`item.isRoot`のときに入る。`items`は前回の値（`[]`）のまま触れられず、`ghost`も`null`のまま。
- **Drag（ゴースト生成前）**: `mode: "drag"`、`items`に対象アイテムが入るが、`ghost`はまだ`null`。`onDragStart`直後から`onDragMove`の初回呼び出し（実際に1px以上動くまで）の間はこの状態にとどまる。
- **Drag（ゴースト生成後）**: `mode: "drag"`、`ghost`がDOM要素、`ghostPosition`が設定済み。`previousDragState`はドラッグ中に`visualizeDragState()`経由で更新される。
- **Pinch**: `mode: "pinch"`、`pinchDistance`が設定される。`touchstart`で指2本が同時に置かれた場合は`items`/`ghost`を一切触らずに直接この状態へ入る。

**要注意な組み合わせ（既存の暗黙の制約/バグの芽）**:
- ドラッグ中（`mode: "drag"`、`ghost`が存在）に2本目の指が触れると、`onDragMove`から`handlePinch()`が呼ばれ、`current.mode`が`"pinch"`に変わる。このときドラッグ用の`ghost`は`remove()`されずに残ったままになる（`current.ghost`もクリアされない）。Phase 1以降でPointer Events化する際、この遷移を明示的に扱わないと、ゴースト要素がDOMに取り残された状態でピンチズームが行われるバグを再現/継承してしまう。
- `grabOffset: [0, 0]`は初期状態オブジェクトに宣言されているが、`mouse.js`内のどこからも読み書きされていない（呼ばれない）デッドフィールド。Phase 6の後片付けで削除候補にする。
- `ctrlHeld`は、既に選択済みのアイテムをドラッグする経路（`isSelected`が`true`の分岐）では一切更新されず、前回のドラッグ時の値が残ったままになる。次の未選択アイテムのドラッグでは`onDragStart`で必ず上書きされるため実害は今のところ無いが、状態機械化（Phase 2）の際は「この状態変数は`drag`開始時に常にリセットされる」という前提を作らないよう注意。

**`mouse.test.js`が既にカバーしている回帰観点**:
- フォーカスハンドオフ: ドラッグ開始時に`container.focus()`が呼ばれること（"focuses the scoped container when a drag starts"）。
- `isCanvasActive()`によるバックグラウンド時の無視（"ignores mousedown while the canvas is backgrounded"）。
- ホイールズームのアンカー座標（"zooms around the wheel cursor position"）。
- ドロップ先の当たり判定（`elementFromPoint`優先、`getStableDropCollision`のスティッキー挙動）（"uses the node directly under the pointer as the drop target"）。
- post-dragクリックの抑制（`current.suppressNextClick`）が選択位置を変えないこと（"does not let the post-drag click move selection to the drop target"）。

**現時点で回帰テストが存在しない箇所**（Phase 1以降で特に注意が必要）:
- ピンチズーム（`handlePinch`、`getTouchDistance`、`PINCH_THRESHOLD`）。
- タッチの長押しによるコンテキストメニュー起動（`touchContextTimeout`）。
- `isDragging()`/`cancelDrag()`（`command/edit.js`のCancelコマンドから参照される公開API）。
- Ctrl+クリックで複数選択されたアイテムを一括ドラッグする経路（`current.items`が複数件になるケース）。

**移動距離のしきい値について**: 現状のドラッグには明示的な「○pxだけ動いたらドラッグ開始」というしきい値は存在しない。`onDragStart`で`current.mode`は即座に`"drag"`になり、`buildGhost()`は`onDragMove`の初回呼び出し時（＝実際に座標が変化した最初の瞬間）にのみ実行される。つまり「1pxでも動けばゴーストが生成される」という暗黙の閾値が、実質的な唯一の閾値になっている。これは`onClick`の`current.suppressNextClick`ロジック（`ghost`が存在した場合だけpost-dragクリックを抑制する）とも整合しており、Phase 2以降で状態機械を導入する際もこの不変条件（「ghostの有無 = 実際に動いたかどうか」）を壊さないよう注意する。

---

### Phase 1 — Pointer Eventsへの統一（当たり判定・状態はそのまま）

- `touchstart`/`mousedown`/`mousemove`/`mouseup`/`touchmove`/`touchend`のリスナーを`pointerdown`/`pointermove`/`pointerup`/`pointercancel`に置き換える。
- `eventToPoint()`の`"touches" in e`分岐が不要になり、`e.clientX`/`e.clientY`に一本化できる。二本指ピンチ検出（`e.touches.length == 2`）は`pointerdown`が指ごとに個別発火するため、`nodeDraggable.ts`の`pinchHelper`と同様に`activePointers: Map<number, {x, y}>`で自前管理する形に変える（詳細はPhase 2で状態機械と一緒に扱う）。
- `setPointerCapture`/`releasePointerCapture`を使うことで、指の位置を追跡し続けるための`document`レベルのフォールバックリスナーが不要になる。今の`onDragStart`は`mousedown`のときだけ`port.addEventListener("mousemove", onDragMove)`のように動的に追加/削除しているが、Pointer Eventsでは`target.setPointerCapture(e.pointerId)`を呼べば、ポインタが`port`の外に出てもそのポインタのイベントは同じターゲットに配送され続けるため、リスナーの動的着脱そのものが丸ごと不要になる。
  ```js
  // mouse.js — after Phase 1
  function onPointerDown(e) {
    if (!isCanvasActive() || !app.currentMap) {
      return;
    }
    // ...existing item/mode decision logic unchanged...
    if (current.mode == "drag" || current.mode == "pan") {
      port.setPointerCapture(e.pointerId);
    }
  }
  ```
- `init()`/`dispose()`の登録リストを Pointer Events 版に置き換える。`click`と`dblclick`と`wheel`と`contextmenu`はポインタ操作ではなく別のセマンティクスを持つブラウザイベントなので、Phase 1では**あえてそのまま残す**（`nodeDraggable.ts`側の`mouse.ts`も同様に`click`/`contextmenu`/`wheel`は独立リスナーのまま扱っている）。
- `mouse.test.js`は`mousedown`/`mousemove`/`mouseup`をディスパッチしているため、Phase 1の変更に合わせて`pointerdown`/`pointermove`/`pointerup`にリネームする。CLAUDE.mdの「バグ修正の前に失敗する回帰テストを書く」に厳密には該当しない（バグ修正ではなくAPI移行）が、イベント名を変えるテストの機械的な置換だけで済むように、まずテストのイベント名を差し替えてから実装を変更し、テストが落ちることを確認してから直す、という順序にする。
- タッチ用の`TOUCH_DELAY`（コンテキストメニュー用の500msタイマー）は、`e.pointerType === "touch"`で判定するように変更するだけで、ロジック自体（`touchContextTimeout`）はPhase 1では変更しない（Phase 3でlong-press helperとして切り出す）。

確認事項（要検証）:
- Pointer Events は Safari含む主要ブラウザで長らく対応済みだが、`pointerType`（`"mouse" | "touch" | "pen"`）の値がブラウザ間で完全に一致するか、特にペンタブレットでの挙動を手動確認する。
- `setPointerCapture`されたポインタに対する`pointercancel`（OSレベルのジェスチャー割り込みなど）が、現状の`mouseup`/`touchend`の代わりに正しく`onDragEnd`相当を呼ぶか確認する。今のコードには`pointercancel`に相当するクリーンアップ経路が存在しない（`touchend`はあるが、OSジェスチャーによる強制中断は考慮されていない）ため、これはPhase 1で新たに正しくなる部分でもある。

リスク: 中。イベント配送の仕組みそのものが変わるため、ドラッグ開始・終了・キャンセルの三点を大きめの手動確認マトリクスで確認する必要がある。既存の`mouse.test.js`のモック（`eventTarget()`ヘルパー）がPointer Events用のディスパッチに対応できるよう更新する。

---

### Phase 2 — 明示的な状態機械の導入

`current.mode`という素の文字列を、`nodeDraggable.ts`の`State`定数のような明示的な列挙に置き換える。ただし`nodeDraggable.ts`の`BoxSelect`はmy-mindには存在しない概念（my-mindは`app.selectedItems`によるCtrl+クリック式のマルチ選択のみで、範囲選択のドラッグは実装されていない）ため含めない。タッチ/ペン対応を延期したことに伴い、`Pinch`状態も含めない（ピンチズームに本格着手する際に追加する）。

```js
// mouse.js — new state enum, replacing the current.mode string.
// No Pinch state: pinch-zoom/touch support is deferred (see this doc's
// revision note at the top).
const State = {
  Idle: 0,
  Pan: 1,
  Drag: 2,
};
```

- `current.mode`のすべての読み書き箇所（`onDragStart`/`onDragMove`/`onDragEnd`/`isDragging()`/`cancelDrag()`）を`State`定数に置き換える。文字列比較(`current.mode == "drag"`)から数値比較に変わるだけで、遷移条件自体は変えない。
- `isDragging()`が公開APIとして`command/edit.js`の`Cancel`コマンドから参照されている点に注意する。返り値の意味（true/false）は変えず、内部表現だけを置き換える。
- ピンチ検出をPhase 1で自前管理した`activePointers`と組み合わせ、`onPointerDown`内で「2本目の指が置かれた」ことを検出したら`State.Pinch`に遷移させる。既存の`handlePinch()`のしきい値判定（`PINCH_THRESHOLD`）はそのまま流用する。

確認事項（要検証）:
- `Pan`と`Drag`の遷移条件（アイテムの有無で分岐する`onDragStart`の既存ロジック）は変えないことを、Phase 0で書き出した状態組み合わせ表と突き合わせて確認する。

リスク: 低。挙動を変えない機械的なリネームが中心だが、`isDragging()`のような外部公開APIの参照箇所を漏れなく洗い出す必要がある。

---

### Phase 3 — Long-press helper の抽出（タッチのドラッグ開始判定） — 延期

**このフェーズはタッチ/ペン対応の本格着手まで延期する。** 以下は将来参照するための元の計画のまま残す。

現状の`touchContextTimeout`は「タッチで押し始めてから500ms後、まだドラッグが始まっていなければコンテキストメニューを開く」というタイマーだが、`onDragMove`が呼ばれた時点で`clearTimeout(touchContextTimeout)`するだけの素朴な実装で、`nodeDraggable.ts`の`longPressHelper`のように「動いた距離がしきい値を超えたら明示的にキャンセルする」という判定は持っていない（移動量に関わらず、`onDragMove`が一度でも呼ばれればタイマーは止まる）。

- `longPressHelper`相当の小さなオブジェクトを`mouse.js`内に切り出す。
  ```js
  // mouse.js — long-press helper, replaces the bare touchContextTimeout variable
  const longPressHelper = {
    timer: null,
    startPos: null,
    MOVE_THRESHOLD: 10, // px; matches nodeDraggable.ts's cancellation distance
    start(point, cb) {
      this.startPos = point;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.startPos = null;
        cb();
      }, TOUCH_DELAY);
    },
    handleMove(point) {
      if (this.timer === null || !this.startPos) {
        return;
      }
      const dx = point[0] - this.startPos[0];
      const dy = point[1] - this.startPos[1];
      if (Math.hypot(dx, dy) > this.MOVE_THRESHOLD) {
        this.clear();
      }
    },
    clear() {
      clearTimeout(this.timer);
      this.timer = null;
      this.startPos = null;
    },
  };
  ```
- `onDragStart`（タッチ経路）で`longPressHelper.start(point, () => { item && app.selectItem(item); menu.open(point); })`を呼ぶ。
- `onDragMove`で無条件に`clearTimeout`していた箇所を`longPressHelper.handleMove(point)`に置き換える。これにより「わずかに指がぶれただけでコンテキストメニューが無効化されてしまう」という既存の過敏さが緩和される（しきい値内の揺れではメニューが開けるようになる）。これは意図的な挙動変更なので、回帰テストと手動確認の両方に明記する。
- `onDragEnd`/`cancelDrag()`/`dispose()`の`clearTimeout(touchContextTimeout)`をすべて`longPressHelper.clear()`に置き換える。

リスク: 低〜中。タッチの長押しメニューが「動いたら即キャンセル」から「しきい値を超えたらキャンセル」に変わる、唯一の意図的な挙動変更を含むフェーズ。実機（またはブラウザのタッチエミュレーション）での確認が必須。

---

### Phase 4 — Edge auto-scroll（`EdgeMoveController`パターン）の追加

`nodeDraggable.ts`にあってmy-mindに存在しない新機能。ノードをドラッグして画面端に近づけると、キャンバスが自動的にその方向へパンし続ける。タッチ固有の話ではなく、マウスドラッグでも有用な機能なので、タッチ/ペン対応の延期とは無関係に実施してよい。

- `EdgeMoveController`をほぼそのまま移植する。my-mindでは`mind.move(dx, dy)`の代わりに`app.currentMap.moveBy([dx, dy])`を呼ぶ点だけが差分になる。
  ```js
  // mouse.js — ported from mind-elixir-core's nodeDraggable.ts EdgeMoveController
  class EdgeMoveController {
    constructor() {
      this.isMoving = false;
      this.interval = null;
      this.speed = 20;
    }
    move(dx, dy) {
      if (this.isMoving) {
        return;
      }
      this.isMoving = true;
      this.interval = setInterval(() => {
        app.currentMap.moveBy([dx * this.speed, dy * this.speed]);
      }, 100);
    }
    stop() {
      this.isMoving = false;
      clearInterval(this.interval);
      this.interval = null;
    }
  }
  ```
- `onDragMove`（`State.Drag`のとき）で、`port.getBoundingClientRect()`と現在のポインタ位置を比較し、端から一定距離（例: 50px）以内なら`edgeMoveController.move(dx, dy)`を呼ぶ。中央寄りに戻ったら`edgeMoveController.stop()`を呼ぶ。
- `onDragEnd`/`cancelDrag()`/`dispose()`で必ず`edgeMoveController.stop()`を呼び、タイマーのリークを防ぐ。

確認事項（要検証）:
- `app.currentMap.moveBy()`は`docs`未記載だが`map.js`の`moveTo()`をラップしており、`ensureItemVisibility`のような他の自動パン処理と競合しないか（同時に2つのパン処理が働いて振動しないか）を手動確認する。
- 大きめのマップ（50ノード以上）で、自動パン中もドラッグゴーストの追従とドロップ判定（`computeDragState`）が正しく動くか確認する。

リスク: 中。新機能であり既存挙動を壊すリスクは低いが、`setInterval`ベースのタイマーとSolidの`layoutVersion`駆動のレイアウト再計算が競合しないか（毎100msごとの`moveBy`がレイアウトのcreateComputedを不要に再トリガーしないか）は要確認。`moveBy`は`position`（transformのみ）を書き換えるだけでレイアウト自体は再計算しないため、原理的には問題ないはずだが、実測で確認する。

---

### Phase 5 — ドロップ視覚化：`insertPreview`パターンは不採用（現状維持）

`nodeDraggable.ts`の`insertPreview()`/`clearPreview()`は、ドロップ先ノードに`before`/`after`/`in`いずれかのCSSクラスを付けて枠線やインジケータを表示する方式。一方my-mindの`visualizeDragState()`は、ドロップ先ノードに`box-shadow`をオフセット方向つきで描画する方式。両者は見た目のアプローチが異なるだけでなく、**ドロップ判定モデル自体が違う**:

- `nodeDraggable.ts`（`before`/`after`/`in`）は、常に「兄弟として挿入」か「子として挿入」のどちらかであり、ノード自体を親にする概念がない。
- my-mindの`computeDragState()`（`append`/`sibling`）は、ドロップ先ノードの中心付近なら「そのノードの子として追加」、外側にはみ出せば「そのノードの兄弟として、方向つきで挿入」という、ノードのcontentSizeに対する近接度で判定するモデル。これは`MapLayout`の左右分岐（`root:left`/`root:right`）や`side`プロパティと密結合しており、`before`/`after`/`in`モデルへの置き換えは今回のスコープを大きく超える。

したがって、**Phase 5では視覚表現もドロップ判定モデルも変更しない**。`visualizeDragState()`はPhase 1〜4のリファクタの影響を受けない（`state`オブジェクトの生成元である`computeDragState()`にも触れない）ことを明記し、「参考にしたが採用しなかった部分」として記録に残す。

リスク: なし（変更しないため）。

---

### Phase 6 — 後片付け・回帰チェックリスト

- `TOUCH_DELAY`/`PINCH_THRESHOLD`/`DROP_TARGET_STICKY_PADDING`など、Phase 1〜4を通じて役割が変わらなかった既存定数はそのまま残す。
- `mouse.test.js`をPointer Events版のディスパッチヘルパーに統一し、Phase 1〜4それぞれで追加した挙動（長押しのしきい値、edge auto-scrollの開始/停止）に対応する単体テストを追加する。
- 回帰チェックリスト:
  - マウスでのノードドラッグ＆ドロップ（append/sibling両方）が従来通り動く。
  - タッチでのノードドラッグ＆ドロップが従来通り動く。
  - タッチの長押しでコンテキストメニューが開く。指が`MOVE_THRESHOLD`を超えて動いた場合は開かない。
  - 二本指ピンチでズームできる。
  - ドラッグ中に画面端へポインタを近づけるとキャンバスが自動パンし、中央へ戻すと止まる（Phase 4の新機能）。
  - ドラッグ終了直後のpost-dragクリックで選択位置が変わらない（`current.suppressNextClick`の既存挙動）。
  - `isCanvasActive()`が`false`（Notesモードなど）の間はどのポインタ操作も無視される（`docs/02-workspace-mode-switch-refactor.md`のPhase 3ガードが引き続き機能する）。
  - `Escape`によるドラッグキャンセル（`command/edit.js`の`Cancel`コマンド、`mouse.isDragging()`経由）が従来通り動く。
- `docs/07-mouse-refactor.md`自体をこの回で完了とし、次に実装が必要な場合は各Phaseごとに個別のPR/コミットとして進める（`docs/mindmap-state-refactor.md`と同じ運用方針）。

リスク: なし（整理・検証のみ）。

---

## フェーズ一覧

| Phase | 内容 | リスク | 依存 |
|---|---|---|---|
| 0 | 現状の特性化（コード変更なし） | なし | — |
| 1 | Pointer Eventsへの統一（マウスのみ、タッチのピンチ/長押しは未実装） | 中 | Phase 0 — **完了** |
| 2 | 明示的な状態機械の導入（`Pinch`状態は含めない） | 低 | Phase 1 |
| 3 | Long-press helperの抽出 | 低〜中 | Phase 2 — **延期**（タッチ対応着手時） |
| 4 | Edge auto-scroll（`EdgeMoveController`）の追加 | 中 | Phase 2 |
| 5 | ドロップ視覚化: 不採用の記録のみ | なし | — |
| 6 | 後片付け・回帰チェックリスト | なし | Phase 1–4 |

各フェーズは独立した1コミット/PRとして扱い、前フェーズの動作確認が終わってから次に進む（既存の`docs/01-mindmap-state-refactor.md`や`docs/02-workspace-mode-switch-refactor.md`と同じ運用方針）。Phase 4はPhase 2にのみ依存する。Phase 3（タッチの長押し）はタッチ/ペン対応に本格着手するタイミングまで実施しない。
