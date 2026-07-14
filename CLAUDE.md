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

## Work in Progress

- backendは、PocketBase **v0.39+**をつかったものへ、frontendは、solid.js + **tailwind v4** をつかったものへ並行して書き換えている。
- バックエンドのほうが書き換えが容易だと思われるので、先にバックエンドのリファクタリングを行う。
- フロントエンドは、go-templateをつかったSSRアプリからSolid.jsをつかったSPAへの書き換えが必要になっている。
- フロントエンドは、タイプスクリプトを使ったコードを、JavaScriptに戻した。一部、戻し忘れによるバグがある。
- フロントエンドは、フレームワーク（solid.js）をつかったコードの書き換えもすすめている。
- Catalog.index関連は、go-templateでやっていたが本質機能ではないので現状リンク切れの状態でよい。
- 重複コードの削除を優先的に行う。
- とりあえずは、Solid.jsを使ったSPAへの書き換えよりも、旧アプリが正しく表示されるように配線を優先させる。