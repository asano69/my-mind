# My Mind
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/asano69/my-mind)

<img src="frontend/public/favicon.svg" width="100" align="right" />

My Mind is a web application for creating and managing Mind maps.  
New to Mind maps? They are useful, aesthetic and cool! Read more about these special diagrams in [the Wikipedia article](https://en.wikipedia.org/wiki/Mind_map).



<img src=".github/assets/sample-01.png" width="800">

## Plan
- 各マインドマップにIDを降る（現状、名前ベースで不安定）
- CSRに移行する。マインドマップの切り替えはもっとスムーズであるべき。
- データの保存は、WebDAVのような不安定なものではなく、PocketBaseを使う。


## Work in Progress
- 開発環境のセットアップ。フロントエンド、バックエンドでビルドできるようにする。
- フロントエンドからPocketBase APIを使用して、マップを保存できるようにする
- バックエンドをPocketBaseをつかったコードに置き換える。
- フロントエンドのマインドマップ関連のコードはlibまたはcomponentsに移動するようにする。以下のコードはsold.js用のテンプレ
    - frontend/src/lib/
    - frontend/src/main.jsx
    - frontend/src/routes/
---

## Ref
- [ondras/my-mind](https://github.com/ondras/my-mind)
- Demo: https://my-mind.github.io/
