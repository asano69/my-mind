# Overview


## Rules

- データベースのマイグレーションはPocketBaseのWEB UIから行うのでマイグレーションコードを作成する必要はまったくない。
- When fixing bugs, add a failing regression test first.
- All errors are user-facing, so messages should be clear.
- Keep functions small and focused.
- Module files should re-export what's needed, hide implementation details.
- Don't persist changes to the database during drilling. Use the cache.
- Don't use timezones: dates are naive for a reason. Due dates etc. are more like the dates in a journal entry than precise points in time.

## Tech Stack

- backend: Go + PocketBase **v0.39+**
- frontend: solid.js + **tailwind v4**

## 計画

- backendは、PocketBase **v0.39+**をつかったものへ、frontendは、solid.js + **tailwind v4** をつかったものへ並行して書き換えている。
- バックエンドは、go-templateをつかったSSRアプリを前提にした構造から、Solid.jsをつかったSPAを前提にした構造に書き換えが必要の可能性がある。
- フロントエンドは、フレームワーク（solid.js）をつかったコードの書き換えもすすめている。
- Catalog.index関連は、go-templateでやっていたが本質機能ではないので現状リンク切れの状態でよい。
- 重複コード、未使用コードの削除を優先的に行う。


# Work in progress
- フロントエンドのプロジェクト構造をフレームワークSolid.jsを前提にした構造に書き換える
- フロントエンドのマインドマップ関連のコードはlibまたはcomponentsに移動するようにする。以下のコードはsold.js用のテンプレ

    frontend/src/lib/
    frontend/src/main.jsx
    frontend/src/routes/


