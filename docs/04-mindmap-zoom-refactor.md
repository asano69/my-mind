# マインドマップのズーム操作がスムーズでない

トラックパッドの `wheel` イベントは、ブラウザの描画フレーム(約16ms間隔)とだいたい同期して発火するため、rAFで間引いても**呼び出し回数はほとんど減りません**。本当の問題は「呼び出し回数」ではなく、**1回の `adjustFontSize()` 呼び出し自体が重い**ことです。

`adjustFontSize()` → `requestLayout()` → `createComputed` 経由で `layoutSubtree()` が同期実行され、そこでは:

- 全アイテムの `offsetWidth`/`offsetHeight` を読む(強制リフロー)
- 全アイテムの connectors SVG を `innerHTML = ""` で消してから再構築

というO(ノード数)の重い処理を毎ティック行います。ノード数がそれなりに多いマップだと、これ1回だけで16msの予算を超えてしまうので、たとえ1フレームに1回に絞ってもカクつきます。

## 本質的な対策

「見た目のズーム(即座・滑らか)」と「実際のノードサイズ変更に伴うレイアウト再計算(重い)」を分離します。ホイール中は SVG に `transform: scale()` を当てるだけの軽い視覚フィードバックにとどめ、実際に `adjustFontSize`(＝フルツリーrelayout)を呼ぶのはホイール操作が止まってから一度だけにします。

```
frontend/src/lib/mindmap/map.js
<<<<<<< SEARCH
    this.position = [0, 0];
    this.fontSize = 15;
=======
    this.position = [0, 0];
    this.fontSize = 15;
    // Pending wheel/pinch zoom not yet committed to fontSize (see
    // previewZoom/commitZoom below).
    this._zoomAccum = 0;
    this._zoomTimeout = null;
>>>>>>> REPLACE
```

```
frontend/src/lib/mindmap/map.js
<<<<<<< SEARCH
  adjustFontSize(diff) {
    this.fontSize = Math.max(8, this.fontSize + 2 * diff);
    this.node.style.fontSize = `${this.fontSize}px`;
    this.requestLayout();
    this.ensureItemVisibility(app.currentItem);
  }
=======
  adjustFontSize(diff) {
    this.fontSize = Math.max(8, this.fontSize + 2 * diff);
    this.node.style.fontSize = `${this.fontSize}px`;
    this.requestLayout();
    this.ensureItemVisibility(app.currentItem);
  }

  // Called on every wheel/pinch tick. adjustFontSize() triggers a
  // synchronous full-tree relayout (see requestLayout in this file),
  // which is too slow to run on every tick for maps with many nodes and
  // causes visible jank. Instead, apply an instant CSS transform for
  // smooth visual feedback, and only commit the real (expensive) relayout
  // once the user stops scrolling/pinching.
  previewZoom(diff) {
    this._zoomAccum += diff;
    const scale = (this.fontSize + 2 * this._zoomAccum) / this.fontSize;
    this.node.style.transform = `scale(${scale})`;
    if (this._zoomTimeout !== null) {
      clearTimeout(this._zoomTimeout);
    }
    this._zoomTimeout = setTimeout(() => this.commitZoom(), 150);
  }

  // Applies the accumulated preview zoom for real (one relayout pass)
  // and clears the temporary transform, since the node's actual size now
  // reflects the new fontSize.
  commitZoom() {
    this._zoomTimeout = null;
    const diff = this._zoomAccum;
    this._zoomAccum = 0;
    this.node.style.transform = "";
    if (diff) {
      this.adjustFontSize(diff);
    }
  }
>>>>>>> REPLACE
```

```
frontend/src/lib/mindmap/map.js
<<<<<<< SEARCH
  hide() {
    this.node.remove();
  }
=======
  hide() {
    // Don't leave a pending zoom commit firing against a map that's no
    // longer shown.
    if (this._zoomTimeout !== null) {
      clearTimeout(this._zoomTimeout);
      this._zoomTimeout = null;
      this._zoomAccum = 0;
    }
    this.node.remove();
  }
>>>>>>> REPLACE
```

`mouse.js` 側は `adjustFontSize` を直接呼んでいた2箇所を `previewZoom` に差し替えるだけです。

```
frontend/src/lib/mindmap/mouse.js
<<<<<<< SEARCH
  let dir = deltaY > 0 ? -1 : 1;
  app.currentMap.adjustFontSize(dir);
}
=======
  let dir = deltaY > 0 ? -1 : 1;
  app.currentMap.previewZoom(dir);
}
>>>>>>> REPLACE
```

```
frontend/src/lib/mindmap/mouse.js
<<<<<<< SEARCH
  const delta = dist - current.pinchDistance;
  if (Math.abs(delta) >= PINCH_THRESHOLD) {
    app.currentMap.adjustFontSize(delta > 0 ? 1 : -1);
    current.pinchDistance = dist; // reset baseline after each step
  }
=======
  const delta = dist - current.pinchDistance;
  if (Math.abs(delta) >= PINCH_THRESHOLD) {
    app.currentMap.previewZoom(delta > 0 ? 1 : -1);
    current.pinchDistance = dist; // reset baseline after each step
  }
>>>>>>> REPLACE
```

## 挙動

- ホイールを回している間: `transform: scale()` だけが更新される(GPU合成、relayoutなし)ので滑らか
- 150ms止まった時点: 蓄積した分をまとめて `adjustFontSize()` に一度だけ渡し、実際のノードサイズ変更+relayoutが1回走る。同時に `transform` をクリアするので、見た目がそのまま実サイズに置き換わる

`transform-origin` は指定していないので、SVG要素自身のバウンディングボックス中心(デフォルトの50% 50%)を軸にズームします。カーソル位置を中心にしたい場合は追加対応が要りますが、まずはこれでカクつきは解消するはずです。



---
# マインドマップのズーム後のSVG位置ずれ問題

## 原因

`previewZoom()` はドラッグ中（ホイール/ピンチ操作中）は本当のレイアウト計算をせず、`svg` ノード全体に `transform: scale(...)` をかけているだけです。

```js
previewZoom(diff) {
  this._zoomAccum += diff;
  const scale = (this.fontSize + 2 * this._zoomAccum) / this.fontSize;
  this.node.style.transform = `scale(${scale})`;
  ...
}
```

一方、実際の確定処理（`commitZoom` → `adjustFontSize` → `requestLayout`）は `layoutSubtree()` を再実行して、本物のレイアウトを再計算します。

ここが本質的な問題です。レイアウト計算（`graph.js`/`tree.js`/`layout.js`/`map.js`）で使われている間隔は、フォントサイズに関係なく**固定px**です。

- `graph.js`: `SPACING_RANK = 16`
- `tree.js`: `SPACING_RANK = 32`
- `layout.js`: `SPACING_CHILD = 4`
- `map.js` (MapLayout): `LINE_THICKNESS = 8`
- `item.js`: `TOGGLE_SIZE = 7`

つまり本当のレイアウトは「文字サイズだけが伸び縮みして、ノード間の余白は一定」という**非一様な変化**です。一方 CSS の `scale()` は「文字も余白も全部同じ比率で伸び縮みする」という**一様な変化**です。

この2つは数学的に別の変換なので、拡大率が1から離れるほど（＝ズーム量が大きいほど）プレビューと確定後の結果は必然的にズレます。これは実装ミスではなく、「CSS transform でプレビューを近似する」という設計自体が持つ構造的な限界です。**1pxも狂わないように厳密一致させる方法は、実質的に1つしかありません。**

## 唯一の厳密解: 間隔をフォントサイズに比例させる

上記の固定px定数を、すべて `fontSize` に比例する値に変えれば、実レイアウトそのものが「フォントサイズに対して一様スケール」になります。そうなれば `scale(newFontSize / oldFontSize)` という CSS transform は、確定後の本当のレイアウト結果と数学的に完全に一致します（origin を `0 0`、つまり `node` の左上に固定しておけば位置もズレません）。

具体的には:

- `graph.js` の `SPACING_RANK`、`tree.js` の `SPACING_RANK`、`layout.js` の `SPACING_CHILD`、`map.js` の `LINE_THICKNESS`、`item.js` の `TOGGLE_SIZE` を、`Map` インスタンスの `this.fontSize` に応じた値として計算し直す必要があります（現状は多くがモジュールトップレベルの定数で、フォントサイズを知りません）。

これは「余白もズームで一緒に伸び縮みする」という見た目の変化を伴う、そこそこ大きな設計変更です（該当ファイル横断）。

## 進める前に確認したいこと

1. 上記のとおり「間隔もフォントサイズに比例して拡大縮小されるようになる」という見た目の変更を許容できますか？（現状は文字だけ大きくなり、間隔は一定のまま）
2. それとも、厳密一致は諦めて「プレビュー中の近似のズレを減らす／確定時のジャンプを目立たなくする」程度の軽い対応（例: デバウンス時間の調整、easingで滑らかに遷移）で妥協しますか？

1で進める場合は、影響範囲（`graph.js`, `tree.js`, `layout.js`, `map.js`, `item.js`）を洗い出した上で Search/Replace 形式のdiffを作成します。