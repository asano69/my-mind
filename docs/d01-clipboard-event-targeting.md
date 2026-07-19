# なぜ clipboard.js は document のcaptureフェーズでイベントを拾うのか

## 背景

2026-07、フルリロード直後にノードを選択してCtrl+Vを押しても子ノードが
作成されない、しかしCtrl+Bなど別のコマンドを一度実行した後なら動作す
る、という不具合が発生した。原因調査の結果、`keydown`/`click` と
`cut`/`copy`/`paste` とでブラウザのイベントターゲット解決ロジックが
根本的に異なることが判明した。この文書はその違いと、なぜ
`clipboard.js` だけ他の入力系モジュール（`keyboard.js`/`mouse.js`）と
異なる場所でリッスンしているかを記録する。同じ勘違いを繰り返さないた
めの参照ドキュメント。

## 事実: イベント種別ごとのtarget解決ルールが違う

- `keydown`/`mousedown`/`click`: `document.activeElement`（フォーカス
  されている要素）、またはクリックされた座標のDOM要素が起点になる。
  `containerEl`（`MindMapCanvas.jsx` の `tabIndex="-1"` div）に
  `.focus()` さえ当たっていれば、`containerEl` 自身か、その子孫がク
  リックされた場合に確実にバブリングで拾える。
- `cut`/`copy`/`paste`: **フォーカスではなく、現在の Selection（選択
  範囲）がDOM上のどこにあるかで target が決まる。** `containerEl` は
  SVGマインドマップを描画するための空のdivで、その中に実際のテキス
  ト Selection が存在する場面はほぼない。Selection が存在しない、あ
  るいは `containerEl` の外にある場合、ブラウザは paste の target を
  `document.body` にフォールバックする。

`containerEl` は DOM 上 `document.body` の子孫であって祖先ではないの
で、target が `body` になった時点で `containerEl` に付けた bubble
フェーズのリスナーには**原理的に絶対届かない**。

## なぜ「Ctrl+Bを一度実行すると直る」ように見えたか

`command/edit.js` の `Style`（Bold等）は `execCommand` の前に
`selection.selectNodeContents(app.currentItem.dom.text)` を呼び、ド
キュメント内に実際の Range/Selection を作る。この Selection が
`stopEditing()` 後もブラウザ側に残存し、以降の paste の target 解決
が `containerEl` の配下寄りになる、という**副作用に過ぎない**。これ
は修正ではなく偶然の回避であり、Selection を作らない操作（例:
ノード選択の移動だけ）を挟むと再び壊れる可能性がある。

## 採用した設計

`clipboard.js` は `containerEl` ではなく `document` に、bubbleではな
くcaptureフェーズでリスナーを登録する。

```js
// clipboard.js — see docs/05-clipboard-event-targeting.md
document.addEventListener("cut", onCopyCut, true);
document.addEventListener("copy", onCopyCut, true);
document.addEventListener("paste", onPaste, true);
```

target がどこに解決されようと document には必ず到達するため、
Selection の状態に依存しない。`isCanvasActive()` / `ui.isActive()` /
`app.editing` によるガードは元々ハンドラ内部にあるため、リッスンする
場所を変えてもスコープの安全性（Notesモード中は無視する、他の入力欄
へのpasteを妨げない等）はそのまま維持される。

## 今後の指針

- **`cut`/`copy`/`paste`/`selectionchange` を新規に扱う場合は、
  `containerEl`（フォーカスベース）に付けるのではなく、この
  `clipboard.js` と同じパターン（`document` + capture）を踏襲する。**
  「フォーカスが当たっているから拾えるはず」という前提はこの4種のイ
  ベントには通用しない。
- `keydown`/`click`/`mousedown` など座標・フォーカスベースのイベント
  は今回の問題の対象外であり、`keyboard.js`/`mouse.js` の既存の
  `containerEl` ベースの実装のままで問題ない。
- 複数キャンバスを同時マウントする設計（現状は非ゴール、
  `docs/02-workspace-mode-switch-refactor.md` Phase 4 参照）に拡張す
  る場合、`clipboard.js` は document スコープでグローバルに動くため、
  「今アクティブなキャンバスはどれか」を判定する仕組みが別途必要にな
  る。`isCanvasActive()` は現状 canvas/notes の2値しか区別しないた
  め、その時点で見直しが必要。
- デバッグ手法として、ブラウザDevToolsコンソールに `addEventListener`
  をラップするprobeスクリプトを注入し、実際の `event.target` と
  `document.activeElement` をログすることで、フォーカス起因かターゲ
  ット解決起因かを素早く切り分けられる（今回の調査で有効だった）。
