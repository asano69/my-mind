# マインドマップエンジンの宣言的Solidコンポーネント化計画

## この計画の位置づけ

`docs/01-mindmap-state-refactor.md`（以下doc01）から始まった一連のリファクタ（doc02〜doc07、特にdoc05〜doc06.1）は、「`item.js`/`map.js`はvanillaなclassのまま、SolidのSignal/Memoを外付けする」という前提のもとで行われてきた。この前提自体が、いくつもの構造的な苦しさを生んでいる。

- `Item._layoutResult`（`createMemo`）がDOM書き込みという副作用を持つ（doc06.1自身が「Solidの推奨作法から外れる」と明記）。
- `_sideVersion`/`_contentVersion`/`_childrenVersion`/`dirtyVersion`/`layoutVersion`など、「変更を知らせるためだけのプレーンなsignal」が乱立し、bump忘れが起きるたびに新しいバグの温床になっている（doc09.5progress note、doc06.1のPhase 7 progress noteなど、bump漏れ・二重bump系の議論が繰り返し出てくる）。
- `foreignObject`のペイントタイミング問題への対処（rAF二重待ち）が`map.js`の`show()`と`item.js`の`insertChild()`/`collapsed`セッターに個別に散在している。
- `notes.js`↔`NotesEditor.jsx`、`title.js`↔`store.js`、`context-menu.js`↔`ContextMenu.jsx`のような`registerXxx`/`dispose`ブリッジパターンが、エンジンがSolidコンポーネントでないことの直接的な帰結として、アプリ全体に広がっている。

これらは個別にはdoc05〜doc07で妥当な判断のもとに解決されてきたが、doc06.1のPhase 8が「複雑さに見合う効果がない」として見送られたことに象徴されるように、**この前提の上でできる改善は収穫逓減に入っている**。

この計画は、前提そのものを変える。

> `item.js`/`map.js`/`layout/*.js`/`shape/*.js`を「classベースのエンジン + 外付けSignal」から、「SVGツリーそのものをSolidが所有する宣言的コンポーネント」へ書き換える。

## Non-goals

- レイアウトの幾何計算アルゴリズム自体（`layout/graph.js`/`tree.js`/`map.js`の座標計算、`shape/*.js`の見た目計算）は変更しない。doc05〜doc07で磨き込まれた計算ロジックはそのまま関数として移植する。書き換えるのは「その計算結果をいつ・どうDOMに反映するか」という配線部分だけ。
- ドラッグ&ドロップの当たり判定（`docs/07-drop-target-detection-refactor.md`で実装済みの軸マージン方式）は変更しない。
- ノートエディタ（`docs/03.1`/`03.2-workspace-mode-switch-refactor.md`）、ワークスペースの前面/背面切り替え（`docs/02-workspace-mode-switch-refactor.md`）は別ドキュメントのスコープであり、本計画では触れない。ただし本計画完了後、`notes.js`のようなbridge patternが不要になる箇所が出てくれば、それは歓迎すべき副産物として別途小さく片付ける。
- バックエンド（Go/PocketBase側）は対象外。
- 新規機能追加は行わない。挙動を変えないリファクタである。

## 設計方針（doc05〜06.1からの転換点）

### なぜ「アイテムごとの独立effect」がついに成立するのか

doc05は「アイテムごとの独立effect」を、Solidの`createComputed`が兄弟間・親子間の実行順序を保証しないという理由で却下した。doc06.1のPhase 0.5でもこの点は再検証課題として残されていた。

しかし、これは「Solidのスケジューラに順序を任せる」場合の話であり、**JSXの子コンポーネントは親コンポーネントのレンダー木の中で構造的に存在する**。`<For each={item.children()}>{(child) => <ItemNode item={child} />}</For>`という書き方をすれば、子の初回マウントは親のレンダー中に同期的に起こり、post-orderの保証はSolidの内部スケジューラではなく、**JSXツリーの構造そのもの**が担う。doc05.1が見出した「再帰的memoチェーン」の発想（子を明示的に読みにいけば順序が保証される）を、memoの代わりにコンポーネントツリーそのもので実現する形になる。

### レイアウト計算とDOM書き込みの分離

現行の`_computeLayout()`/`computeLayout()`は、計算とDOM書き込みが1つの関数に同居している（doc06.1がこれを「作法から外れる」と認めつつ採用した設計）。新しい設計では次のように分離する。

```jsx
// ItemNode.jsx — layout is a pure memo; DOM writes happen in an effect
// keyed off that memo's value, matching Solid's own recommended pattern
// (computation vs. side effect) rather than mixing the two.
function ItemNode(props) {
  let contentRef;
  const [measuredSize, setMeasuredSize] = createSignal([0, 0]);

  // Pure: reads signals, returns a value, touches no DOM.
  const childLayouts = createMemo(() =>
    props.item.collapsed() ? [] : props.item.children().map((c) => c.layoutResult()),
  );

  // Side effect: runs after the DOM (this item's own content box) has
  // actually rendered/updated, and after children have measured
  // themselves (children mount before this effect runs, since they are
  // nested inside this component's own JSX).
  createEffect(() => {
    const size = [contentRef.offsetWidth, contentRef.offsetHeight];
    setMeasuredSize(size);
  });

  return (
    <g class="item">
      <foreignObject>
        <div ref={contentRef} class="content">{props.item.text()}</div>
      </foreignObject>
      <For each={props.item.children()}>
        {(child) => <ItemNode item={child} />}
      </For>
    </g>
  );
}
```

計算部分（`childLayouts`のようなmemo）は副作用を持たないので、Solidの依存追跡がそのまま正しく機能する。DOM計測（`offsetWidth`読み取り）は`createEffect`の中で行い、それは「子のJSXが既にマウントされた後」というJSXツリーの構造によって順序が保証される。

### 手動バージョンカウンタの終焉

`text`/`children`/`collapsed`/`color`などが実データのsignalである以上、それらを直接読む場所（JSX、あるいはそこから呼ばれるmemo）は自動的に依存として登録される。`_contentVersion`のような「意味のない変更マーカー」は、「そのsignal自体を直接読んでいない箇所から間接的に変更を知りたい」というニーズから生まれていた。JSXでツリーそのものを表現すれば、そのニーズ自体が発生しない。

例外は、doc05.1/doc06.1が繰り返し指摘してきた3つの非signal起因トリガー（`item.side`変更、contentEditableのライブ入力、フォントサイズズーム）。これらは新設計でも同様に、対象itemの実データsignal（例えば`side`も実際にsignalにしてしまう）として素直に扱えばよく、専用のversionカウンタを新設する必要はなくなる。

### foreignObjectペイントクイズの解消

rAF二重待ちのハックは、「DOMへ挿入した直後に同期的に計測する」という操作がSVG内`foreignObject`とブラウザの相性で不安定になることが原因だった。JSXコンポーネントの`ref`+`createEffect`を使えば、Solidが「DOMコミット後」に効果を実行するタイミング保証に乗れるため、既存の場当たり的な二重rAFの多くは不要になる可能性が高い。ただし、これはSolid本体の保証ではなくブラウザのペイントタイミングの問題でもあるため、Phase 3で実機検証してから機械的に消すかどうか判断する（詳細はPhase 3参照）。

## フェーズ計画

### Phase 0 — 現状の仕様固定（コード変更なし）

- `item.test.js`/`action.item.test.js`/`map.test.js`/`mouse.test.js`など、既存のテストスイート全体を「移行後も壊れてはいけない仕様書」として扱う。今回のリファクタは実装方式の変更であり、挙動の変更ではない。
- 手動確認のためのシナリオ一覧を作る: テキスト編集、collapse/expand、色・レイアウト・シェイプの継承、value/statusの自動計算、undo/redo、ドラッグ&ドロップ（append/sibling判定）、コピー&ペースト、ズーム、大量ノード（50〜100）でのレイアウト崩れの有無。
- `docs/06.1-recursive-memo-layout-refactor.md`のPhase 0はブラウザDevToolsコンソールから対話的にカウンタを仕込む計測手法を前提にしていたが、本計画ではそれを踏襲しない。CIで繰り返し実行でき、手動操作を伴わない`frontend/src/lib/mindmap/layout-measurement.test.js`（vitest）を新設し、同じ「訪問ノード数のカウント」をプログラマブルに検証する。
  - `item.js`の`_updateLayoutContent`/`_measureOwnContent`/`_writeOwnLayout`を各Itemインスタンス単位でラップし、呼び出し回数を数える（`item.test.js`の`instrumentLayout()`と同じパターン）。
  - 深さ4×分岐3（121ノード）程度の木を組み立て、葉ノードのテキスト編集・status/value/icon/notes変更・中間ノードのcollapse切り替え・ルートの色変更、それぞれについて変更後の`readItemLayoutResult(root)`呼び出しでの訪問数をアサートする。
  - `requestAnimationFrame`はvitestのデフォルト環境に存在しないため、`item.js`の`collapsed`セッターが使う二重rAFの remeasure をテストファイル全体でスタブする（`item.test.js`の個別スタブと同じ対処をファイル単位で行う）。
  - Solidの実リアクティビティを使うため木の構築・計測を複数回繰り返すとデフォルトの5秒テストタイムアウトを超えることがあり、このテストには明示的に長めのタイムアウトを指定している。
  - 新実装（Phase 3以降）でも、このテストを流用して同水準以上の局所再計算が維持されていることを確認する。

リスク: なし。

### Phase 0 progress note

`frontend/src/lib/mindmap/layout-measurement.test.js`を実装し、深さ4×分岐3（121ノード）の木に対する現行実装（doc06.1完了時点、旧`_layoutResult`方式）のベースライン計測値を記録した。`_updateLayoutContent`/`_measureOwnContent`/`_writeOwnLayout`の呼び出し回数（update/measure/write は常に同数、1回の`readItemLayoutResult(root)`につき1アイテム最大1回ずつ呼ばれるため）:

| シナリオ | update/measure/write | 全ノード数 |
|---|---|---|
| 葉ノードのテキスト編集 | 5 | 121 |
| 葉ノードのstatus/value/icon/notes変更（4プロパティ一括） | 15 | 121 |
| 中間ノード（depth 1）のcollapse切り替え | 2 | 121 |
| ルートの色変更 | 121 | 121 |
| ルートのtextColor変更 | 121 | 121 |

観察事項:

- 葉のテキスト編集は5（木の深さ4+1）に一致し、変更経路（葉→ルート）だけが再計算され、無関係な兄弟枝（このシナリオでは残り116ノード）は一切訪問されない。ローカリティは期待通り機能している。
- status/value/icon/notes変更は15（5×3）になった。4つのプロパティを連続してセットしているが、`notes`のsetterは`_bumpContentVersion`を呼ばない設計（`updateNotes()`のコメント参照）である一方、`status`/`value`/`icon`はそれぞれ独立にバージョンをbumpするため、`batch()`で束ねられていないこの一括変更は変更経路を複数回（3回）再計算させている。これは正しさには影響しないが（Solidのmemoが最終的に収束した値を返すため）、`batch()`で包めば1回に減らせる可能性がある——最適化の余地として記録しておく。実装自体は変更しない（本フェーズはNon-goalsの通り計測のみ）。
- 中間ノードのcollapse切り替えは2（そのノード自身＋ルートまでの祖先）で、期待通り局所的。この計測では`collapsed`セッターの二重rAF remeasure（展開時の子孫全体remeasure）はテストファイル全体で`requestAnimationFrame`をスタブしているため発火しない——collapse方向（`_bumpContentVersion`のみ、rAF不要な同期パス）だけを見ている点に注意。
- ルートのcolor/textColor変更は、当初update=0という結果になった。これはテストハーネスの欠陥（`shape.js`モックの`update`が完全な空振り`vi.fn()`で、本物の`box.js`/`ellipse.js`が行う`item.resolvedColor`の読み取りを再現していなかったため、Solidの依存追跡がそもそも`color`シグナルへの依存を持たなかった）によるものと判明した。モックを実際に`item.resolvedColor`を読むよう修正したところ、update=121（全ノード）という結果になり、**doc05/doc08本文の前提「継承プロパティ（color/textColor/shape/layout）の変更は配下全体に波及する」が実測でも確認された**。`textColor`は`_applyOwnStyle()`が無条件で`resolvedTextColor`を読むため、モック修正なしでも同じ121という結果になり、上記の修正が正しかったことのクロスチェックにもなっている。
- 結論: 現状の実装は「葉ノードの独立プロパティ変更・collapse切り替え」は良好に局所化されている一方、「継承プロパティ（color/textColor/shape/layout）の変更」は木のサイズに比例して全ノードを再計算する。これはdoc05.1/doc06.1が設計時に認識していた既知の制約と一致しており、doc08が動機として挙げる「収穫逓減」は主にこの継承チェーンのケースに当てはまる。Phase 3以降で新実装（再帰描画＋分離されたレイアウトmemo）を評価する際は、このcolor/textColor=121を基準値として比較する。

---

### Phase 1 — データモデルの分離（Item = プレーンなreactiveデータ）

`Item`から「DOM所有」を切り離す。

- 新しい`itemStore.js`を作り、`createStore`（または個別`createSignal`の集合）でツリー構造を表現する。各ノードは `{ id, text, notes, color, textColor, icon, url, value, status, side, shape, layout, collapsed, children }` を持つプレーンなreactiveオブジェクトとする。DOM要素への参照は一切持たない。
- `toJSON()`/`fromJSON()`/`mergeWith()`/`clone()`は、このストア操作として書き直す。ロジック自体（inherited shape判定、`pickBalancedSide`など）は`action.js`に残っている既存のヘルパーをそのまま流用する。
- `resolvedColor`/`resolvedTextColor`/`resolvedShape`/`resolvedLayout`/`resolvedValue`/`resolvedStatus`の継承・集約ロジックは、`createMemo`としてこのストアの上にそのまま移植する（計算ロジック自体はdoc06/06.1で確立済みのものを流用、対象がDOM classからプレーンオブジェクトに変わるだけ）。
- **この時点ではまだ何もレンダリングしない。** `item.test.js`相当のテストを、DOM抜きでこの新ストアに対して書き直し、既存の期待値（continued値の継承、value自動計算、collapse等）が保たれることを確認する。

リスク: 中。既存の`Item`クラスが担っていた責務のうち「データ」と「DOM」をどこで線引きするかが今後の全フェーズに影響するため、ここを慎重に設計する。特に`side`のような非継承・非集約の単純フィールドと、`resolvedColor`のような継承memoを同じ扱いにしない（doc05.1の教訓通り、継承方向のmemoと集約方向のmemoは別物として扱う）。

---

### Phase 2 — `<ItemNode>` コンポーネントの導入（単一ノードのみ、並行稼働）

既存の`item.js`ベースの描画と、新しい`<ItemNode>`ベースの描画を、feature flag（環境変数か`?newEngine=1`のようなクエリパラメータ）で切り替えられる状態にし、並行稼働させる。

- 子を持たないルート1ノードだけをJSXで描画する `<ItemNode item={rootStoreNode} />` を新設する。
- `text`/`color`/`shape`の表示だけをここで検証する。`dom.status`/`dom.value`/`dom.icon`/`dom.notes`/`dom.link`のような既存の`item.js`のDOM組み立てcoordinate（`html.node`/`svg.node`呼び出し）は、対応するJSX要素に一対一で置き換える。
- 既存の`Box`/`Ellipse`/`Underline`（`shape/*.js`）の`update(item)`メソッドは、`item`が今後DOMを持たないプレーンオブジェクトになるため、シグネチャを`update(domRefs, resolvedValues)`のような形に変える必要がある。この変更は`shape/*.js`と`layout/*.js`の両方に波及するため、Phase 3と合わせて設計する。

リスク: 低。並行稼働なので既存動作への影響はゼロ。新旧の見た目を並べて比較できる。

---

### Phase 3 — 再帰描画とレイアウトの分離

`<For each={item.children()}>`による再帰描画を実装し、レイアウト計算とDOM書き込みを分離する（前掲の設計方針を参照）。

- `layout/graph.js`/`layout/tree.js`/`layout/map.js`の`update(item)`メソッドから、「座標を計算する部分」を純粋関数として抜き出す（例: `computeGraphLayout(item, children, childDirection) -> { positions, connectorPaths }`）。これらの関数は`item`のDOMプロパティを一切読み書きしない、`resolvedColor`のような計算済みの値とサイズだけを引数に取る形にする。
- 抜き出した純粋関数を`createMemo`から呼び、その戻り値（座標・connector path文字列）を`createEffect`でSVG要素に書き込む。
- `foreignObject`の実測サイズ（`offsetWidth`/`scrollWidth`）は`createEffect`内の`ref`経由で読み、既存のrAF二重待ちハック（`map.js`の`show()`、`item.js`の`insertChild()`/`collapsed`セッター）がまだ必要かどうかを実機で再検証する。JSXの`ref`はSolidのDOMコミット後に呼ばれるため、多くのケースで単純化できる可能性が高いが、`foreignObject`特有のブラウザ側クイズ（doc06.1のPost-Phase-7 bugで報告されたcollapsed→expand時の再測定問題など）が残る場合は、既存の対策パターンをそのまま`createEffect`内に持ち込む。
- `docs/06.1-recursive-memo-layout-refactor.md`のPhase 0で使った計測手法を使い、葉ノード編集・collapse切り替え・value/status変更・color/layout変更・フォントサイズズームの5シナリオで、新実装の再計算範囲が旧実装（Phase 2までの、doc06.1完了時点の実装）と同等以上に局所化されていることを確認する。

リスク: 高。これが本計画の中核であり、最もリスクが高いフェーズ。旧`layoutSubtree`相当のpost-order不変条件を、JSXツリーの構造だけで本当に保てるか、ここで実証する。1コミットにまとめず、レイアウト種別（graph/tree/map）ごとに小さく分けて進める。

---

### Phase 4 — マウス/キーボード/クリップボードの統合

- `mouse.js`/`keyboard.js`/`clipboard.js`のグローバルリスナー登録を、`<MindMapCanvas>`（`components/MindMapCanvas.jsx`）の`onMount`/`onCleanup`に統合する。既存の`isCanvasActive()`ガード（`scope.js`）、`document`のcaptureフェーズでのclipboardリスニング（`docs/d01-clipboard-event-targeting.md`の教訓）はそのまま踏襲する——これらはDOM/ブラウザAPIの制約であり、エンジンの実装方式とは独立した知見なので変更しない。
- `app.currentItem`/`app.selectItem()`のようなグローバル状態（`my-mind.js`）は、Phase 1で作った`itemStore.js`の`currentItem`シグナルに一本化する。`store.js`の`currentItem`（Solidミラー）と`my-mind.js`の`currentItem`（プレーンフィールド）という二重管理（doc01のPhase 3で意図的に作られた過渡的な仕組み）がここでようやく解消される。
- ドラッグ&ドロップ（`mouse.js`の`computeDragState`/`finishDragDrop`）は、`item.dom.content.getBoundingClientRect()`のようなDOM参照をどう取得し直すかがポイントになる。`ItemNode`側で`contentRef`をitemごとのMapに登録しておき、`mouse.js`側はそのMapを介して座標を引く形にする（現状の`item.dom`直接参照から、`domRefs.get(item.id)`のような間接参照に変える）。

リスク: 中〜高。ユーザー操作の入り口が集中するフェーズなので、`mouse.test.js`/`keyboard.test.js`/`clipboard.test.js`の全シナリオを再実行し、フォーカスハンドオフ、post-dragクリック抑制、ドラッグ中のsticky collisionなど、細かい既存の修正がすべて再現されることを確認する。

---

### Phase 5 — bridge patternの解体

エンジンがSolidコンポーネントになったことで、多くのブリッジが不要になる。

- `ui/notes.js`↔`NotesEditor.jsx`: `registerEditorAPI`は、`NotesEditor.jsx`が`itemStore.js`の`currentItem`を直接読めば多くの部分が不要になる可能性がある。ただしEasyMDE自体がSolidの外側にある独立ライブラリである点は変わらないため、このブリッジ自体は残る想定（Milkdown化やPhase 4/EasyMDEロールバックの経緯を踏まえ、ここは深追いしない）。
- `title.js`↔`store.js`: `document.title`の同期は`createRoot`+`createEffect`の単発ブリッジのままでよい（vanilla moduleがブラウザAPIを触る必要は変わらず残るため）。
- `ui/context-menu.js`: 既に`store.js`の`contextMenuPoint`シグナルへの薄いラッパーになっている（Phase 4完了済み、`docs/01`参照）。この計画では追加の変更は不要。
- 一番大きい変化は、`item.js`の`dom.link`クリックハンドラや`updateLink()`のような「DOMイベント→app呼び出し」のパターンが、JSXの`onClick`props経由の直接呼び出しに変わること。ここはブリッジというより単純化。

リスク: 低〜中。個々のブリッジは独立して評価できるため、1つずつ小さく進める。

---

### Phase 6 — 旧エンジンの削除

- `item.js`の旧classベース実装、`map.js`の`_layoutResult`/`layoutVersion`/`bumpDirty`呼び出し経路、rAF二重待ちハックのうちPhase 3で不要と判断されたものを削除する。
- `docs/05-layout-subtree-scoping-refactor.md`のdirtyフラグ案、`docs/06-recursive-memo-layout-refactor.md`/`06.1`の再帰的memoチェーン案は、歴史的検討として残し、本ドキュメントが最終的な実装方針であることを明記する。
- `CLAUDE.md`のWork in progress節を更新し、「pubsub時代の非リアクティブなグローバル状態」というテーマ自体が本計画の完了をもって解消されたことを記録する。

リスク: 低。Phase 0〜5がすべて完了し、feature flagなしで新実装のみが動く状態を確認してから行う、純粋な削除作業。

---

## フェーズ一覧

| Phase | 内容 | 主な成果物 | リスク |
|---|---|---|---|
| 0 | 現状の仕様固定 | 既存テストを仕様として確定、計測シナリオ一覧 | なし |
| 1 | データモデルの分離 | `itemStore.js`、DOM抜きのデータ操作テスト | 中 |
| 2 | `<ItemNode>`導入（単一ノード、並行稼働） | feature flag、text/color/shapeの検証 | 低 |
| 3 | 再帰描画とレイアウト分離 | 純粋関数化したlayout計算、`createEffect`ベースのDOM書き込み | 高 |
| 4 | マウス/キーボード/クリップボード統合 | `MindMapCanvas`への統合、`currentItem`の一本化 | 中〜高 |
| 5 | bridge patternの解体 | 不要になった`registerXxx`系APIの削除 | 低〜中 |
| 6 | 旧エンジン削除 | `item.js`旧実装・手動versionカウンタ群の削除 | 低 |

各フェーズは、既存ドキュメント群（doc01〜doc07）と同じ運用方針で、1コミット/PRとして独立させ、動作確認してから次に進む。特にPhase 3は最もリスクが高いため、レイアウト種別（graph/tree/map）ごとにさらに細分化し、doc06.1のPhase 0が示した「計測して効果が出なければ中断する」という判断基準をここでも踏襲する——大量ノードでの再計算範囲が旧実装より悪化するようであれば、Phase 3を差し戻し、旧`_layoutResult`方式を維持したまま他の改善（doc07のような機能追加）を優先する。

## 中断条件

- Phase 3完了後の計測で、局所再計算の効果がdoc06.1完了時点の実装と比べて明確に改善しない、またはむしろ悪化する。
- `foreignObject`のペイントタイミング問題が、Solidの`ref`/`createEffect`に乗せても解消せず、旧実装以上に複雑な回避コードが必要になる。
- Phase 4のドラッグ&ドロップ実装で、DOM参照の間接化（`domRefs.get(item.id)`方式）がパフォーマンス上またはコードの見通し上、現状の`item.dom`直接参照より明確に劣る。

これらに該当する場合は、該当フェーズを差し戻し、doc06.1時点の実装（再帰的memoチェーン + 手動versionカウンタ）を現状の到達点として維持し、本計画は凍結する。
