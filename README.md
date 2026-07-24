# My Mind
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/asano69/my-mind)

<img src="frontend/public/favicon.svg" width="100" align="right" />


My Mind is a web application for creating and managing Mind maps.  
New to Mind maps? They are useful, aesthetic and cool! Read more about these special diagrams in [the Wikipedia article](https://en.wikipedia.org/wiki/Mind_map).

<img src=".github/assets/sample-01.png" width="800">

## Usage

* Research notes
* Lecture notes
* Document drafting
* Brainstorming concerns and thoughts
* Priority setting and decision-making


## Features
It has a catalog feature.

<img src=".github/assets/sample-02.png" width="800">


## Demo

Demo URL:
https://my-mind-31or.onrender.com/

The demo takes about 50 seconds to start.

### Login Credentials

- Email: `admin@mail.internal`
- Password: `password`

>[!TIP]
>1. Currently, a new mind map can be saved using **Ctrl + Shift + S.**
>2. To navigate to the Catalog page, click "My mind" in the left sidebar
>3. If the demo site is not displaying correctly or seems to be behaving unexpectedly, please try pressing **Ctrl + Shift + R** to perform a hard refresh.

## Plan
### Frontend
- [x] データ保存コードの整理: マインドマップを保存する経路が2, 3種類ある。自動保存によるmymind形式のみのデータ転送と手動保存によるmymind+svgのデータ転送。保存部分だけ、ファイルを分割したほうがよさそう。
- [x] Catalog遷移時に、svgデータの自動保存
- [x] catalogにおいて、タイトルをクリックしてもそのマップを開くようにする（現在イメージの部分しかクリック可能ではない）
- [x] Catalogにおいて、SVGイメージに埋め込まれたURLなどを誤ってクリックしないように、マウスで選択不可能にする
- [x] my-mind.js アンマウント安全化
- [x] Mindmap Engine → Solid Reactive State: Migration Plan
- [x] canvasで、Catalogアイコンや、タイトル、エディターボタンなどのある細長い部分を、topbarなどのコンポーネント化する
- [x] Canvasで、Map削除ボタンを追加する
- [x] Canvasにおいて、URLはURLとわかるように色を変えて下線をひくCSSにする
- [x] CanvasのSave Asボタンで、マインドマップのpng画像をクリップボードにコピーする
- [x] 手動保存ボタンの設置
- [ ] ノートのあるノードを移動するとき、インジケータアイコンが巨大化するバグ
- [ ] ノードシェープを変えたときに再レンダリングされずに、マップ表示がバグる
- [ ] フロントエンドにおいて自動保存アルゴリズムの調整（スナップショットロード時に自動バックアップされないようにする）
- [ ] 落書き機能（フリーライティング）
- [ ] ノードの移動をdnd-kitに変えられないか検討する
- [ ] hotkeys-js でショートカットキーを扱えないか検討する

### Backend
- [x] マインドマップのスナップショットのサーバサイドでの自動保存（例, 1分ごと30世代、10分ごと24世代、1時間ごと7日。変更がない場合はスキップ）
- [x] UUIDv7へ移行
- [ ] スナップショットのworking以外の種類のバックアップをすジュールする
- [ ] svg画像を配信するルートを作成。 (http://localhost:3001/maps/UUID/svg)


## Work in Progress
- [ ] **大量ノードの場合パフォーマンスに問題がでるという深刻な問題。doc5.1**
- [ ] Undo/Redoボタンの設置
- [ ] クライアントサイドでの自動転送（保存）機能の無効化と有効化を切り替えるトグルスイッチ（デフォルトでは無効化）


## Ref
- [ondras/my-mind](https://github.com/ondras/my-mind)/ Demo: https://my-mind.github.io/
- “ladigitale/digimindmap: Une application en ligne pour créer des cartes mentales - Codeberg.org”. Codeberg.org, [https://codeberg.org/ladigitale/digimindmap](https://codeberg.org/ladigitale/digimindmap), (Accessed 2026-07-15) https://ladigitale.dev/digimindmap/#/m/042ac87be2cbb57b
- “BaffinLee/mindmap: Simple online mindmap editor”. GitHub, [https://github.com/BaffinLee/mindmap](https://github.com/BaffinLee/mindmap), (Accessed 2026-07-15)

Markdown Editor:
- https://stackblitz.com/edit/easymde

