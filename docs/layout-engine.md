# レイアウトエンジン設計詳細 — 再帰的per-itemメモチェーン

## この文書について

`docs/architecture.md`の「2. レイアウト計算」を要約から詳細版として切り出したもの。
`ItemNode.layoutResult`（`itemStore.js`）がなぜ・どうやって「変更されたノードから
ルートまでの経路だけを再計算する」という性質を実現しているかを、却下された設計・
実装時に踏んだ具体的な罠・実測データまで含めて記録する。

対象読者: レイアウト計算まわり（`itemStore.js`の`_computeLayout()`、
`layout/*.js`の純粋関数、`NewMindMapPreview.jsx`のJSX側measurement effect）を
触る人。日常の機能追加ではここまで読む必要はなく、`architecture.md`の要約で足りる。

---

## 1. 設計の核心: pull-basedなmemoの再帰呼び出し

各`ItemNode`インスタンスは、自分専用のレイアウト結果memoを1つ持つ。

```js
// itemStore.js の constructor 内、createRoot ブロックの中
this.layoutResult = createMemo(() => this._computeLayout());
```

`_computeLayout()`は、レイアウトを計算する過程で、可視な子それぞれの
`child.layoutResult()`を**直接呼ぶ**。

```js
_computeLayout() {
  this.contentSize = this._measuredSize() ?? this.defaultContentSize();

  // Post-order: 子を先に確定させる。JavaScriptの関数呼び出し順序が
  // そのままpost-order保証になる — Solidのスケジューラには一切頼らない。
  const childLayouts = this.collapsed
    ? []
    : this.childItems.map((child) => child.layoutResult());

  const result = computeLayoutSnapshot(this._layoutForCompute(), this);
  this.size = [
    result.width ?? this._fallbackComputedWidth(),
    result.height ?? this._fallbackComputedHeight(),
  ];

  return { item: this, childLayouts, connectorPaths: result.connectorPaths, size: this.size };
}
```

Solidの`createMemo`はpull-based（遅延評価）である。あるmemoの中で別のmemoを
「読む」（＝呼ぶ）と、そのmemoがstaleならその場で同期的に再計算されてから
値が返る。これはSolidの実装の詳細ではなく、memoというプリミティブの定義
そのものである。

この性質を使うと、**post-orderという不変条件（子が親より先に確定していないと
親のレイアウトが計算できない）を、Solidのeffectスケジューラの順序保証に
一切頼らずに、素のJavaScriptの関数呼び出し順序だけで満たせる**。

継承方向（`resolvedColor`のように、子が親を読む）と、この集約方向
（`layoutResult`のように、親が子を読む）は、完全に独立した2本のpull-based
memoチェーンとして共存できる。互いに特別扱いを必要としない。

## 2. なぜ「変更経路だけ」再計算されるのか

`child._childrenVersion`や`child._measuredSize`のようなsignalがbumpされると、
そのsignalに依存している`child.layoutResult`だけがinvalidateされる。親の
`layoutResult`はその子の`layoutResult()`を呼んでいるので、子がinvalidateされれば
親も再計算対象になり、これが根まで連鎖する。

しかし**兄弟ブランチは誰にも読まれていない**ので、Solidのメモ化によって
完全にスキップされる。手動の`dirty`フラグや`markDirty()`のような追加の状態
管理を一切増やさずに、「変更経路だけ再計算」という性質が手に入る。

## 3. 厳守すべきルール: 計算とsignal書き込みを混ぜない

`_computeLayout()`（`layoutResult`の中身）は**signalを読むだけ**で、
**signalの書き込みもDOM操作も絶対に行わない**。この境界を破ると、後述する
無限再帰クラッシュが再発する。

- `contentSize`/`contentPosition`/`position`/`size`は、layout/*.jsの純粋関数が
  書き込むプレーンな（非signalな）フィールドであり、`layoutResult()`を
  最初に一度呼んだ後でなければ安全に読めない。JSX側でこれらを読む箇所
  （`NewMindMapPreview.jsx`の`box()`/`underlinePath()`など）は、必ず先に
  `layout()`（memo本体）を呼んでから読んでいる。
- 実測サイズの書き込み（`item.setMeasuredSize()`）は、必ずDOMが実際に
  コミットされた**後**、コンポーネントの`createEffect`側からのみ呼ぶ。
  `_computeLayout()`の内部から呼んではならない。

## 4. 却下された設計とその理由

### 4.1 アイテムごとの独立effect（最初の検討、doc05で却下）

「各アイテムが自分の`createEffect`/`createComputed`を持ち、それぞれが独立に
スケジューリングされる」設計は自然に見えるが、Solidの複数の独立した
`createComputed`は同一トランザクション内でバッチ実行されるだけで、
**兄弟間・親子間の実行順序を保証しない**。現在のレイアウトは「子のサイズを
実測してから親がそれを読む」というpost-order不変条件に強く依存しているため、
順序が保証されない設計は採用できなかった。

### 4.2 手動dirtyフラグ方式（doc05で検討、採用直前で再考）

`item._dirty`フラグ + `markDirty()`（上方向）+ `markSubtreeDirty()`
（継承プロパティ用の下方向）という設計も検討された。動作はするが、
継承プロパティ（color/textColor/shape/layout）だけ下方向にも辿る必要が
あるという**非対称な特別扱い**が必要になり、状態管理の種類が増える
（doc05.1で「拒否された設計の本当の問題」として整理された）。

### 4.3 JSXコンポーネント側でサブツリーごと`createMemo`する案（実装して無限再帰でクラッシュ）

これは実際に実装され、`InternalError: too much recursion`でクラッシュした
（doc08 Phase 3 note 3/4）。原因は以下のいずれか、あるいは複合と推定された:

1. `ItemNodeView`側の小さな`createMemo`（shape/textStyle用）が、外側の
   レイアウトmemoの実行スコープの**中で**評価されていた。JSXの評価はレンダー中に
   同期実行されるため、「外側memoの実行→中でJSX生成→中の別memo初期化→
   それが外側memoの依存先と交差」という、Solidの依存グラフが自己参照に
   近い形になっていた可能性がある。
2. 測定用signalのsetterが、外側memoの追跡スコープ内（＝同期実行中）に
   直接呼ばれていた。Solidでは「今評価中のcomputationが依存している
   signalを、そのcomputation自身の実行中に書き換える」と即時再実行の
   ループに入り得る。

いずれにせよ根本原因は、**「計算」と「副作用（signalの書き込み・DOM書き込み）」
を同一computationのスコープに混在させた**ことに尽きる。修正は、
「JSXコンポーネント側で頑張る」のをやめ、`ItemNode`自身（データモデル側）が
自分専用のmemoを持つ形に戻すことだった（＝現在の設計）。

**教訓**: memoの中で他のmemoを読むこと自体は問題ない（それがpull-based
memoの本来の使い方）。問題になるのは、そのmemoの評価スコープの中で
「新しくmemoやeffectを生成する」「signalに書き込む」という副作用が
紛れ込むこと。

## 5. 非signal由来のレイアウトトリガー

doc05.1/doc06.1で挙がっていた3つの特殊ケースは、最終的にすべて「普通の
signal」として扱えることが分かった。

1. **`item.side`変更**: 現在は`itemStore.js`の他のプロパティと全く同じ
   `createSignal`で表現されている。`MapLayout.getChildDirection()`が
   `child.side`を読む箇所は、親の`_computeLayout()`から呼ばれる通常の
   依存として自動的に追跡される。専用のバージョンカウンタは不要だった。
2. **contentEditableのライブ入力**: 対象アイテムの`item.setMeasuredSize()`を
   明示的に呼ぶことで反映する（`newEdit.js`のcommit時、あるいは
   `NewMindMapPreview.jsx`のcontentEffect経由）。
3. **フォントサイズズーム**: 当初「全ノードdirty化が必要な唯一の正当な
   全体トリガー」として設計上の懸念事項に挙げられていたが、実装
   （`newViewport.js`の`adjustZoom()`）を確認したところ、ズームは
   SVGノード全体へのCSS `transform: scale()`のみで行われており、
   `font-size`自体は変化しない（＝どのアイテムの実測サイズにも影響しない）。
   結果として「全ノードdirty」という設計は最終的に実装不要だった
   （doc06.1 Phase 8で正式に見送りと結論）。

## 6. 実測によるローカリティの検証

`itemStore-layout-locality.test.js`（深さ4×分岐3、121ノードの木）での実測:

| シナリオ | 再計算されたノード数 | 備考 |
|---|---|---|
| 葉ノードの実測サイズ変更 | 5 (= depth+1) | 葉→祖先の経路のみ、無関係な兄弟は0 |
| collapsed配下の変更 | 0（配下は`layoutResult`が一度も呼ばれない） | `collapsed`ガードで子孫のmemoが誰にも読まれない |
| ルートのcolor変更 | 1（ルート自身のみ） | connectorのstroke色はJSX側のレンダー時に解決するため、`_computeLayout()`自体はcolorを読まない。唯一の例外はルートの`layoutRoot()`が各枝の`resolvedColor`を読む点 |

比較として、旧エンジン（`item.js`、doc08 Phase 0の計測）では同じcolor変更
シナリオで121ノード中121ノードが再計算されていた。**「見た目だけに関わる
値（stroke色）をジオメトリ計算のmemoから追い出す」という設計判断が、
実測でも1桁以上のローカリティ改善として裏付けられている。**

大きな木（depth4×width5、781ノード）での実測時間（doc08 Phase0のベンチマーク、
旧エンジン）: 葉ノード編集=1.5ms、ルート色変更（全木伝播）=39ms。781ノード
規模でも39msはフレーム予算（16.7ms）は超えるが「固まる」レベルではないと
判断されている。新エンジンでは色変更のローカリティがさらに改善しているため、
この数値はむしろ上限の目安として扱ってよい。

## 7. 実装時のデバッグ・計測パターン

`_computeLayout`の呼び出し回数を数えるスパイを、木構築後・最初の
`layoutResult()`呼び出し後にインストールする（`createMemo`のクロージャは
`this._computeLayout`を**その都度**`this`から引き直すため、構築後に
プロパティを差し替えるだけで以降の再計算もインターセプトできる）。

```js
function instrumentTree(root) {
  const calls = new Map();
  function wrap(item) {
    const original = item._computeLayout.bind(item);
    item._computeLayout = () => {
      calls.set(item.id, (calls.get(item.id) ?? 0) + 1);
      return original();
    };
    item.children.forEach(wrap);
  }
  wrap(root);
  return calls;
}
```

この計測ヘルパーは`itemStore-layout-locality.test.js`・
`newMouse-drag-locality.test.js`・`newEngine-large-tree-regression.test.js`
で繰り返し使われている実績パターン。新しい操作（ドラッグ、undo/redo等）を
追加した際に局所性が壊れていないか確認する場合は、このパターンをそのまま
再利用する。

## 8. 見送られた最適化: サイズ確定値の明示依存化（doc06.1 Phase 8）

当初の計画では、各ItemがcontentSizeの確定値をsignal/memoとして公開し、
親レイアウトが子の`getBBox()`を直接読む箇所を減らす、という追加の最適化
（Phase 8）が検討されていた。しかし2026-08時点で確認したところ、この
最適化が主に想定していたコスト源（フォントサイズズームによる全ノード
再計測）は、上記6節の通り実際には発生しないことが判明した。全ツリー
再計算のトリガーが実質なくなった以上、残る更新経路（葉ノード編集・
collapse・value/status変更・color/layout継承）はすでに再帰memoチェーンで
変更経路のみに限定されており、追加の最適化で見込める効果は小さいと
判断し、**実装しないことを決定した**。「複雑さに見合う効果がなければ
実装しない」という方針の実例として記録しておく。将来、実際に
`getBBox()`呼び出し回数がボトルネックになると計測で確認できた場合にのみ
再検討する。

## 9. ローカルDOM同期のper-item effect化（部分的に実施済み）

`updateText()`/`updateIcon()`/`updateNotes()`相当の「自分のDOMだけを
書き換える」処理は、`_computeLayout()`の外に出し、`Item`ごとの
`createEffect`として実装されている（doc06.1 Phase 7）。

- `updateText()`/`updateIcon()`は、実際にDOMを書き換えた後で「コンテンツ
  サイズが変わりうる」ため、明示的にサイズ確定用のsignalをbumpする。
- `updateNotes()`はバンプ**しない**: notesバッジは絶対配置され、実測される
  コンテンツボックスに一切影響しないため、ここでバンプすると不要な
  再計算を再導入することになる。
- `updateStatus()`/`updateValue()`は`resolvedStatus`/`resolvedValue`という
  子孫集約memoに依存するため、意図的に`_computeLayout()`側（post-order
  パスの中）に残されている。

**教訓**: 「自分のDOMだけを触るか、子孫の集約値を読むか」でeffect化の
可否が分かれる。後者はpost-orderパスの外に出すと順序保証が崩れる。
