# My Mind
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/asano69/my-mind)

<img src="frontend/public/favicon.svg" width="100" align="right" />

My Mind is a web application for creating and managing Mind maps.  
New to Mind maps? They are useful, aesthetic and cool! Read more about these special diagrams in [the Wikipedia article](https://en.wikipedia.org/wiki/Mind_map).



<img src=".github/assets/sample-01.png" width="800">

## Plan

リファクタリングの目的
- 各マインドマップにIDを降る（現状、名前ベースで不安定）
- CSRに移行する。マインドマップの切り替えはもっとスムーズであるべき。
- データの保存は、WebDAVのような不安定なものではなく、PocketBaseを使う。
- 最終ゴールは、Mindmapライブラリを、Solidのリアクティブな状態管理に書き換える

- [x] vite 開発サーバでフロントエンドを動かす
- [x] vite 開発サーバから、バックエンド起動時にデータを保存できるようにする
- [x] easymd.jsなどは、pnpm moduleを使うようにする
- [ ] vanila JSをSolid.jsをつかい、フロントエンドの構造を整理する
- [ ] go embedでフロンエンドコードをバックエンドに結合できるようにする

その他
- [ ] ファイル名とトピック名を分離する。中心ノードの名前とファイル名は同じにするべきではない。


## Work in Progress
- [ ] フロントエンドのプロジェクト構造をフレームワークSolid.jsを前提にした構造に書き換える
- [ ] フロントエンドのマインドマップ関連のコードはlibまたはcomponentsに移動するようにする。以下のコードはsold.js用のテンプレ
    - frontend/src/lib/
    - frontend/src/main.jsx
    - frontend/src/routes/
- [ ] バックエンドをPocketBaseを前提にしたコードに置き換える。


## Ref
- [ondras/my-mind](https://github.com/ondras/my-mind)/ Demo: https://my-mind.github.io/
