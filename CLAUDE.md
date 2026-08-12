# Overview


## Rules

- データベースのマイグレーションはPocketBaseのWEB UIから行うのでマイグレーションコードを作成する必要はまったくない。
- 後方互換性は維持しなくてよい。
- When fixing bugs, add a failing regression test first.
- All errors are user-facing, so messages should be clear.
- Keep functions small and focused.
- Module files should re-export what's needed, hide implementation details.
- 「シンプルさを優先する」は、リファクタリングの変更そのもの（diffの大きさや手数）をシンプルに保てという意味ではない。判断基準になるのは、機能（UX）を損なわずに**最終的なコードがどれだけ見通しよく・保守しやすくなるか**（＝DXの向上）である。UXの複雑さや変更そのものの複雑さは、それ単体では判断基準にならない。
- シンプルさが狙っているのはDXの向上だけではない。UXを直感的に保つこと自体も目的の一つである。両者はトレードオフの関係ではなく、原則として同じUXを実現するためにこそDXを向上させる、という関係にある。DXを優先するあまりUXを犠牲にしてよいわけではない一方、UXを理由にDXの改善（内部実装の見通しの良さ）を後回しにし続けてよいわけでもない。
- したがって、リファクタリングの過程で変更自体が複雑になる（多くのファイルに手を入れる、既存の仕組みを大きく組み替える等）ことは、それ単体では避ける理由にならない。逆に「変更を小さく保つ」ことを優先して、結果的にコードの見通しが悪いまま（バージョンカウンタの乱立、ブリッジパターンの拡散など）残すことは、このルールが意図する方向性ではない。
- 迷ったときは「この変更は複雑か？」ではなく「同じUXを保ったまま、この変更の結果コードは前より読みやすく・保守しやすくなっているか？」を問うこと。
- 変更内容を Codex形式(Search/Replace形式)で出力してください。
例）
```
mathweb/flask/app.py
<<<<<<< SEARCH
from flask import Flask
=======
import math
from flask import Flask
>>>>>>> REPLACE
```

## Tech Stack

- backend: Go + PocketBase **v0.39+**
- frontend: solid.js + **tailwind v4**

## 計画

- backendは、PocketBase **v0.39+**をつかったものへ、frontendは、solid.js + **tailwind v4** をつかったものへ並行して書き換えている。
- バックエンドは、go-templateをつかったSSRアプリを前提にした構造から、Solid.jsをつかったSPAを前提にした構造に書き換えている。
- フロントエンドは、Pure JSを使ったレガシーな構造から、Solidの宣言型リアクティビティに置き換える。
- フロントエンドは、マインドマップエンジンのコンポーネント化も進めている。
- 重複コード、未使用コードの削除を優先的に行う。


# Work in progress
- pubsub時代の「非リアクティブなグローバル状態を都度読みに行く」パターンの発見とリファクタリング
