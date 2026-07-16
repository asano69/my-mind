# My Mind
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/asano69/my-mind)

<img src="frontend/public/favicon.svg" width="100" align="right" />

My Mind is a web application for creating and managing Mind maps.  
New to Mind maps? They are useful, aesthetic and cool! Read more about these special diagrams in [the Wikipedia article](https://en.wikipedia.org/wiki/Mind_map).

<img src=".github/assets/sample-01.png" width="800">

It has a catalog feature.

<img src=".github/assets/sample-02.png" width="800">

## Plan
- [x] データ保存コードの整理: マインドマップを保存する経路が2, 3種類ある。自動保存によるmymind形式のみのデータ転送と手動保存によるmymind+svgのデータ転送。保存部分だけ、ファイルを分割したほうがよさそう。
- [x] Catalog遷移時に、svgデータの自動保存
- [x] catalogにおいて、タイトルをクリックしてもそのマップを開くようにする（現在イメージの部分しかクリック可能ではない）
- [x] Catalogにおいて、SVGイメージに埋め込まれたURLなどを誤ってクリックしないように、マウスで選択不可能にする
- [ ] Canvasにおいて、URLはURLとわかるように色を変えて下線をひくCSSにする
- [ ] canvasで、Catalogアイコンや、タイトル、エディターボタンなどのある細長い部分を、topbarなどのコンポーネント化する
- [ ] Canvasで、Map削除ボタンを追加する
- [ ] svg画像を配信するルートを作成。http://localhost:3001/img/UUID
- [ ] キャンバスで、右ペインが戻らなくなるバグの修正
- [ ] CanvasのSave Asボタンで、マインドマップのpng画像をクリップボードにコピーする


## Work in Progress
- [x] my-mind.js アンマウント安全化
- [ ] Mindmap Engine → Solid Reactive State: Migration Plan

## Ref
- [ondras/my-mind](https://github.com/ondras/my-mind)/ Demo: https://my-mind.github.io/
- “ladigitale/digimindmap: Une application en ligne pour créer des cartes mentales - Codeberg.org”. Codeberg.org, [https://codeberg.org/ladigitale/digimindmap](https://codeberg.org/ladigitale/digimindmap), (Accessed 2026-07-15)
- “BaffinLee/mindmap: Simple online mindmap editor”. GitHub, [https://github.com/BaffinLee/mindmap](https://github.com/BaffinLee/mindmap), (Accessed 2026-07-15)
