## doc08 Phase 3 現状棚卸しとPhase 4移行のための再計画

progress note 1〜10を読み返すと、Phase 3の元々の4項目のうち実際に完了しているのは1つだけで、残り3つは未完了、かつ計画外の後退（memo方式の断念）と計画外の重複（shape側の未着手）が新たに発生しています。まずここを可視化してから、Phase 4に進める形にサブフェーズを再構成します。

### 1. 元計画 vs 実績の棚卸し

| 元計画の項目 | 状況 | 根拠 |
|---|---|---|
| ① `layout/{graph,tree,map}.js` の純粋関数化（座標・connector計算とDOM書き込みの分離） | **完了** | note1: `computeGraphLayout`/`computeTreeLayout`/`computeMapLayout` がdescriptorを返す形に分離済み。旧`update(item)`は互換ラッパーとして残置 |
| ② 純粋関数を`createMemo`から呼び、結果を`createEffect`でDOM反映（＝変更経路だけ再計算されるリアクティブ設計） | **未達成・計画からの後退** | note3で「各`ItemNodeView`が子孫layoutを再計算 → 無限再帰」が発覚し、note4で**createMemoでの包み込み自体を撤回**、ルートで1回だけ同期計算する方式に変更。これによりdoc08の中心目的だった「無関係な枝は再計算しない」という性質は**新エンジンではまだ一切実現されていない** |
| ③ `foreignObject`実測を`ref`+`createEffect`へ移し、rAF二重待ちハックの要否を実機検証 | **部分完了** | note5で測定signal自体は配線済み。ただし**実ブラウザでのpaintタイミング検証は一度も行われていない**（note8, note10で繰り返し「保留」と明記） |
| ④ `layout-measurement.test.js`相当の計測を新エンジンにも用意し、旧実装（doc06.1完了時点）と再計算範囲を比較 | **未着手** | Phase 0のベースラインは旧エンジンのみ。新エンジン側の対応するテストが存在しない |
| （計画外）rootのtoggleクラッシュ修正 | 完了 | note9 |
| （計画外）previewが実データ(`loadByUuid`)を読むように | 前進 | note10。ただし選択/編集/undo等の操作統合はまだ |
| （計画外の新規問題）`shape/{box,ellipse,underline}.js`側の純粋関数化が未着手 | **未対応・重複発生** | Phase 2の時点で「shape側のシグネチャ変更はPhase 3と合わせて設計する」とされていたが、実際には`NewMindMapPreview.jsx`が`shapeStyle()`/`underlinePathFor()`という**別実装**を独自に持ってしまっている。CLAUDE.mdの「重複コードの削除を優先する」方針に反する |

### 2. 設計判断が必要な論点

**A. レイアウト計算のリアクティブ化を再挑戦するか、同期フル再計算を正式採用するか**

note4の後退により、現状は「シグナルが変わるたびに可視ツリー全体を毎回同期計算し直す」実装になっています。これはdoc08が目指した「変更経路だけ再計算する」設計とは異なりますが、doc08自身のPhase 0計測（781ノードで色変更＝全木伝播が39ms）を踏まえると、**全木再計算でも実用上は問題にならない可能性が高い**です。doc08の動機は元々パフォーマンスではなくDX（`_contentVersion`等のversionカウンタ乱立の解消）だったことも踏まえ、「毎回全木を同期計算する」を正式方針として採用し、per-item局所化は追求しない、という選択肢は十分にCLAUDE.mdの「シンプルさ最優先」に合致します。ただし正式決定はしていないので、Phase 3.4で明示的に判断してから進めるべきです。

**B. shape側の重複実装**

layout側と同じ「DOM書き込みを含まない純粋関数を切り出す」作業をshape側にも適用し、`NewMindMapPreview.jsx`の独自実装を置き換える必要があります。

### 3. 再構成したサブフェーズ計画

#### Phase 3.4 — 再帰問題の原因特定とリアクティブ方式の正式決定

- note3/4のクラッシュを再現する最小ケースを作り、原因を特定する（有力な仮説: レイアウト計算を包む`createMemo`の実行中に、子コンポーネント側の別の`createMemo`（`shape`/`textStyle`等）が`resolvedShape`のようなSolid memoを読み、Solidの実行中computation内で新たなcomputationが生成される禁則パターンに触れている）。
- 上記「論点A」を決定する：
  - 案(a) 真のインクリメンタル局所化をあらためて設計する（`untrack()`で計算をmemoの外側に閉じる、子のmemo読み取りをレイアウト計算そのものから分離する、等）
  - 案(b) 単一のトップレベル`createComputed`が可視ツリー全体を毎回同期計算する方式を正式採用する（Phase 0の計測結果を根拠として明記）
- コード変更は最小限、意思決定と根拠の記録が主目的。
- リスク: なし

#### Phase 3.5 — レイアウト計算の正式なリアクティブ境界の実装

- Phase 3.4の決定に従い実装する。案(b)の場合でも「毎回シグナルを直接読む」ことは維持し、`_contentVersion`のような手動versionカウンタは持ち込まない（doc08本文の狙いはここで守る）。
- `layout-measurement.test.js`と同型の計測テストを新エンジン向けに追加し、doc06.1 Phase 0の基準値（葉編集=5訪問/121ノード、色変更=121訪問/121ノード等）と比較できる形で結果を残す。
- リスク: 中

#### Phase 3.6 — `foreignObject`実測のブラウザ実機検証

- vitestはnode環境のため検証不可。手動確認、またはbrowser-modeテスト導入のいずれかで、doc06.1のPost-Phase-7で報告された「collapsed→expand直後の再測定漏れ」パターンが新エンジンでも起きるか確認する。
- 再現する場合のみ、旧実装の二重rAF remeasureパターンを`createEffect`内へ持ち込む。再現しなければ「Solidのコミット後ref呼び出しで十分だった」と明記して終える。
- リスク: 中（ブラウザ依存で再現性が低い可能性）

#### Phase 3.7 — `shape/*.js`の純粋関数化と重複実装の解消

- `box.js`/`ellipse.js`/`underline.js`から、layout側と同じパターンでDOM非依存の見た目計算（例: `computeBoxStyle(item)`、`computeUnderlinePath(item)`）を抜き出す。
- `NewMindMapPreview.jsx`の`shapeStyle()`/`underlinePathFor()`を削除し、抜き出した共有関数の呼び出しに置き換える。
- リスク: 低（既存の見た目計算ロジック自体は変更しない、抽出と重複排除のみ）

#### Phase 3.8 — Phase 3完了条件の確認

以下すべてを満たしてからPhase 4着手とする:

- [ ] Phase 3.4の意思決定が記録され、Phase 3.5で実装済み
- [ ] 新エンジンの再計算範囲について、旧エンジンのPhase 0基準値と比較可能な計測結果がある
- [ ] `foreignObject`実測のブラウザ実機確認が完了、または既知の制約として明記済み
- [ ] shape側の重複実装が解消されている
- [ ] `pure-layout.test.js`/`NewMindMapPreview.test.jsx`/新規計測テストが全て通過
- [ ] `?newEngine=1`で実際の保存済みマップを開いてクラッシュしないことを手動確認済み

### 4. Phase 4着手時の前提

元のPhase 4（mouse/keyboard/clipboard統合、`app.currentItem`の`itemStore.js`への一本化、ドラッグ&ドロップのDOM参照間接化）は、「レイアウトの再帰描画とDOM書き込みの分離が完了している」ことを前提にしています。現状（note10終了時点）ではPhase 3.4〜3.8が未消化のままであり、ここを飛ばしてPhase 4に進むと、doc08自身の中断条件（「局所再計算の効果が改善しない/悪化する」）を判定する前に操作統合のコストが積み上がってしまいます。3.4〜3.8を先に完了させることを推奨します。

### 5. フェーズ一覧（更新版）

| Phase | 内容 | リスク | 状態 |
|---|---|---|---|
| 3.1〜3.3 (旧note1-3相当) | layout純粋関数化・descriptor化・単一パス化 | — | 完了 |
| 3.4 | 再帰原因の特定とリアクティブ方式の決定 | なし | 未着手 |
| 3.5 | レイアウト計算の正式なリアクティブ境界の実装＋計測 | 中 | 未着手 |
| 3.6 | `foreignObject`実測のブラウザ実機検証 | 中 | 未着手 |
| 3.7 | shape側純粋関数化・重複排除 | 低 | 未着手 |
| 3.8 | Phase 3完了条件チェック | — | 未着手 |
| 4 | mouse/keyboard/clipboard統合、`currentItem`一本化 | 中〜高 | 3.8完了後に着手 |

3.4の意思決定（論点A）だけは、進める前に一度相談させてください。案(b)（同期フル再計算を正式採用）を推す場合、doc08本文の「再帰的memoチェーンではなくJSXツリー構造で順序保証する」という設計思想の一部を諦めることになるため、これは実装上の詳細ではなく設計方針の変更に当たります。


---


## Phase 3.4を「プランA」で確定する場合の設計

doc06.1が実機（`item.js`）で既に実証している「各アイテムが自分専用の`createMemo`を持ち、親が子のmemoを直接呼ぶ（pull-based再帰memoチェーン）」は、それ自体は健全な設計です。note3/4の再帰クラッシュは、この設計を**JSXコンポーネントツリー側で再現しようとした際の実装ミス**であって、設計思想そのものが破綻していたわけではないはずです。まずそこを切り分けます。

### なぜ再帰したのか（root cause仮説）

note3/4の記述を素直に読むと、崩れた実装はおそらく次のような形になっていました。

```jsx
// 推定される問題のあった実装（NG例）
const layout = createMemo(() => computePreviewTreeLayout(root, measuredSizes()));
```

`computePreviewTreeLayout()`は**プレーンな再帰関数**であり、`ItemNode`（store）側にはmemoが存在しません。つまり「1つの巨大な`createMemo`が、ツリー全体をプレーン関数呼び出しで毎回フルスキャンする」設計になっていました。これは doc06.1 が却下した「独立effectを乱立させる案」の逆側の失敗で、**memoは1つなのに責務がitem数分ある**状態です。

再帰の直接原因としては、以下のいずれか（あるいは複合）が濃厚です。

1. `ItemNodeView`側の`shape`/`textStyle`用の小さな`createMemo`が`item.resolvedColor`等（itemStore側のmemo）を読む一方、それが**外側の`layout`memoの追跡スコープの中で**評価されていた（JSXの評価自体がレンダー中に同期実行されるため、外側memoの実行→中でJSX生成→中の別memo初期化→それが外側memoの依存先と交差、という形でSolidの依存グラフが自己参照に近い形になった）。
2. `measuredSizes`のsetterが、`layout`memoの追跡スコープ内（＝同期実行中）に直接呼ばれていた。Solidでは「今評価中のcomputationが依存しているsignalを、そのcomputation自身の実行中に書き換える」と即時再実行のループに入り得ます。

いずれにせよ根本原因は「**1つの巨大memoが計算とDOM測定書き込みを同一スコープに混在させ、しかも子孫の計算も自分の内側で全部やっていた**」ことに尽きます。doc06.1・doc05.1が既に整理した鉄則（「計算」と「副作用（signal write／DOM書き込み）」を同一computationに混ぜない）に単純に違反していた、というのが最も筋の通る説明です。

### 採用する設計：store側にmemoを戻す（doc06.1と同型）

JSXコンポーネント側で頑張るのではなく、**doc06.1で実証済みの「store（`ItemNode`）が自分専用のlayoutResult memoを持つ」パターンをそのまま`itemStore.js`に移植**します。これがdoc08本文が言う「JSXツリー構造がpost-order順序を保証する」の正しい実装です。

```js
// itemStore.js — ItemNode constructor に追加
// Mirrors item.js's proven per-item recursive memo chain (see
// docs/06.1-recursive-memo-layout-refactor.md and item.js's own
// _layoutResult). Owned by the store node itself, not by the JSX
// component, so parent/child pull-based dependency works the same way
// regardless of whether anything is currently mounted.
const [measuredSize, setMeasuredSize] = createSignal([0, 0]);
this._measuredSize = measuredSize;
this.setMeasuredSize = setMeasuredSize; // written only from a component's createEffect, never from inside a memo

createRoot((dispose) => {
  this._disposeLayoutMemo = dispose;
  // Pure computation only: reads signals (own + children's memos),
  // returns a layout snapshot. NEVER writes a signal here — that rule
  // is exactly what note3/4's crash violated.
  this.layoutResult = createMemo(() => this._computeLayout());
});
```

```js
_computeLayout() {
  // Pull children's memos first (post-order, guaranteed by plain JS
  // call order — not by Solid's scheduler, matching doc05.1's insight).
  const childLayouts = this.collapsed
    ? []
    : this.childItems.map((child) => child.layoutResult());

  this.contentSize = this._measuredSize(); // read-only here, never written
  const result = computeMapLayout(previewLayoutFor(this), this); // pure fn from Phase 3.1-3.3
  this.size = /* derive from result */;
  return { item: this, childLayouts, connectorPaths: result.connectorPaths, size: this.size };
}
```

コンポーネント側は**計算をせず、読むだけ**にします。

```jsx
// NewMindMapPreview.jsx — ItemNodeView
function ItemNodeView(props) {
  let contentRef;
  const layout = () => props.item.layoutResult(); // just reads the store's own memo

  // The ONLY place a signal write happens: after Solid has actually
  // committed this item's DOM (contentRef exists), in an effect — never
  // inside layoutResult's own computation.
  createEffect(() => {
    const measured = measureContentSize(contentRef, fallbackContentSizeFor(props.item));
    props.item.setMeasuredSize(measured);
  });

  return (
    <g class="item" transform={props.transform ?? ""}>
      {/* ... */}
      <For each={layout().childLayouts}>
        {(childLayout) => (
          <ItemNodeView
            item={childLayout.item}
            transform={`translate(${childLayout.item.position})`}
          />
        )}
      </For>
    </g>
  );
}
```

この形なら：

- **局所性が本物になる**: `child.text`が変わる→`child.layoutResult`memoだけが無効化→それを読んでいる親の`layoutResult`memoだけが連鎖的に無効化→無関係な兄弟の`layoutResult`はSolidのメモ化で一切再評価されない。doc08が目指していた性質そのもの。
- **手動versionカウンタが不要**: `_contentVersion`のような仕組みを一切増やさずに済む（doc08本文の狙い通り）。
- **再帰しない**: `layoutResult`memoの中では信号の「読み取り」しかしない。DOM測定という副作用は必ず`createEffect`（コンポーネントのマウント後）に隔離されている。measuredSize signalの書き込みが同期的にmemoの評価中に起きることは構造上あり得ない。

### Phase 3.4（確定）でやること

- 上記アーキテクチャを設計として確定する（このメッセージの内容がその記録）。
- 「計算はmemo、副作用はeffect」という境界を`itemStore.js`のコード内コメントとして明記し、以後のPhase（3.5, 3.7, Phase 4）で同じ境界を破らないことをルール化する。
- コード変更はまだ最小限（`ItemNode`に`layoutResult`memoの骨格を追加する程度）に留め、実装本体はPhase 3.5で行う。

### Phase 3.5（見直し）— 実装と計測

- `computePreviewTreeLayout()`（プレーン再帰関数）を廃止し、`root.layoutResult()`を呼ぶだけの形に`NewMindMapPreview`を書き換える。
- `layout-measurement.test.js`と同型のテストを新エンジン向けに追加し、次を確認する:
  - 葉ノードのテキスト編集で、無関係な兄弟の`layoutResult`memoが再評価されないこと（`vi.spyOn`でmemo内部の計算関数呼び出し回数を数える、`item.test.js`と同じ手法）。
  - collapsedノード配下のmemoが呼ばれないこと（note6の境界を維持）。
  - 継承プロパティ（color等）変更時は旧エンジン同様に全木へ伝播すること（これはdoc08/doc06.1が最初から認めている正しい挙動なので、局所化の対象外として明記）。
- 得られた訪問数を、doc06.1 Phase 0の基準値（葉編集=5/121、色変更=121/121）と直接比較できる形で記録する。

### Phase 3.6・3.7は変更なし

`foreignObject`実機検証（3.6）とshape側純粋関数化（3.7）は、このアーキテクチャ変更と独立なので、前回提示した内容のまま進めます。ただし3.7でshapeの見た目計算を抜き出す際も、「計算はmemo、副作用はeffect」の同じ境界を踏襲してください（例えば`Underline`の線描画のような、サイズ確定後にしか計算できない値は、`_computeLayout()`側で完結させ、DOM書き込みだけを`createEffect`に置く）。

### この設計変更が波及する箇所

- `itemStore.js`：`layoutResult`memoの追加（新規、既存フィールドには影響なし）。
- `NewMindMapPreview.jsx`：`computePreviewTreeLayout()`呼び出し箇所を`root.layoutResult()`に置き換え。`measuredSizes`という**Map単位で全ノードの測定値を持つトップレベルsignal**は不要になる（各itemが自分の`measuredSize`を持つため）。これも複雑さの削減になります。
- テストファイル（`NewMindMapPreview.test.jsx`）：`computePreviewTreeLayout`を直接呼んでいるテストは、`root.layoutResult()`を呼ぶ形に書き換えが必要。

この方向で3.5の実装に進めてよいか、あるいは先に`itemStore.js`側の`layoutResult`memoだけを最小実装してテストを書くところから始めるか、どちらがよいですか。