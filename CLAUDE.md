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
- バックエンドのほうが書き換えが容易だと思われるので、先にバックエンドのリファクタリングを行う。
- フロントエンドは、go-templateをつかったSSRアプリからSolid.jsをつかったSPAへの書き換えが必要になっている。
- フロントエンドは、タイプスクリプトを使ったコードを、JavaScriptに戻した。一部、戻し忘れによるバグがある。
- フロントエンドは、フレームワーク（solid.js）をつかったコードの書き換えもすすめている。
- Catalog.index関連は、go-templateでやっていたが本質機能ではないので現状リンク切れの状態でよい。
- 重複コードの削除を優先的に行う。

理想は、pb.jsクライアントを介して、バックエンドのmapsコレクションのmymindフィールドにmindmapを保存できる状態。
# Work in progress

段階的に取り組みましょう

## [object Object] 問題

現状、フロントエンドから、マインドマップを保存しようとすると、IO error: [object Object]となる。

### [object Object] の直接の原因

`webdav.js` の `request()`:
```js
if (response.ok) {
    return text;
} else {
    throw { status: response.status, text }; // ← Errorインスタンスではない
}
```

これを受け取る `backend.js` の `error()`:
```js
error(e) {
    app.setThrobber(false);
    let message = (e instanceof Error ? e.message : e); // Errorでないのでeそのまま
    alert(`IO error: ${message}`); // {status, text} を文字列化 → "[object Object]"
}
```

`e instanceof Error` が false なので `e`（プレーンオブジェクト）がそのままテンプレートリテラルに渡り、`[object Object]` になっています。つまり**リクエスト自体が失敗している**（404 か 401/403）ことが本質で、`[object Object]` はその失敗理由を握りつぶしているだけ

### 根本原因（複数重なっている）

1. **`/maps/...` へのルートがGo側に存在しない**
   `internal/cmd/serve/serve.go` に登録されているのは `/`, `/favicon.svg`, `/assets/{path...}` のみ。`vite.config.js` は `^/maps/` を `127.0.0.1:3000` にプロキシしていますが、その先（PocketBase）にそのパスのハンドラがありません。→ 素の404。

2. **`maps` コレクションのルールが `null`**
   `migrations/1784019750_collections_snapshot.go` を見ると `maps` コレクションは `createRule/updateRule/deleteRule/listRule/viewRule` すべて `null` です。PocketBaseでは `null` は「スーパーユーザーのみ許可」を意味します（`""` なら誰でも可）。旧フロントエンド（`frontend/src/`配下の vanilla JS）は `pb.authStore` を一切使っていないので、たとえ正しいパスに当たったとしても認証なしで弾かれます。
   → **これが「ログイン画面がないことと関係あるのでは」というご推測の答えで、その通りです。** ログイン画面（`Login.jsx`）はSolid.js SPA側にしかなく、旧アプリの実行コンテキストにはPocketBaseの認証セッションが存在しません。

↑ これにかんしては、一時的に、誰でも許可の状態に変更しました。ログインの仕組みが修復次第、Adminのみ許可に戻します。


## 方針

- catalog.htmlは、とりいそぎ機能しなくてよい
- すべての通信をpb.jsをかしいたものに移行する。
- ファイルの保存方法は、このpb.jsをかいしたmapsコレクションへの保存方法以外はいらない
- フロントエンドの/maps/ルートは削除してもよい。それよりもpb.jsをつかうことによって、コード量を減らすことが第一。


- **New** `frontend/src/backend/pocketbase.js` — the only save/load mechanism now.
- **Rewrite** `frontend/src/ui/io.js` — drop the backend-select abstraction entirely, talk to `pocketbase.js` directly.
- **Simplify** the `#io` markup in `frontend/src/index.html` — one filename field, no backend picker.
- **Delete** now-dead files: `ui/backend/{backend,local,file,webdav,image}.js`, `backend/{local,file,webdav}.js`, `ui/format-select.js`, `format/{native,freemind,mma,mup}.js`. (`backend/backend.js` and `backend/image.js` stay — the "copy-image" command uses them directly, and `format/format.js` + `format/plaintext.js` stay — clipboard copy/paste needs them.)
- **Update** `command.js`'s "New" command (drop the `.mymind` suffix from generated names).
- **Update** `vite.config.js` — proxy `/api` instead of `/maps`.


## 詳細計画

- mapsの保存システムを簡素化し、mapsコレクションにはPocketBaseのみを使用するように変更する必要があります。
- ローカル、ファイル、WebDAV、画像ストレージなどの他のバックエンドオプションはすべて削除します。
- catalog.htmlは完全に削除し、/maps/プロキシルートも削除して、最小限の構成にする必要があります。
- 現在の構造を見ると、更新する必要がある frontend/src/ui/io.jsマップが /m/filename.mymind のような URL パスからではなく、名前フィールドから読み込まれるようになったため、復元機能の処理方法を変更する必要があります。
- エントリ ポイントは実際には frontend/src/index.htmlロード src/my-mind.js存在しない main.jsx を参照している外側の index.html ではなく、別のファイルベースのアプローチです。復元関数が URL を解析し、PocketBase バックエンドからマップを読み込む方法を、従来のファイルベースのアプローチに頼るのではなく、変更する必要があります。













