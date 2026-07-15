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

## 前提の整理

今のリポジトリには実質「2つのフロントエンド」が同居している状態です。

1. **旧: vanilla JS製マインドマップエディタ本体**（`item.js` `map.js` `action.js` `history.js` `pubsub.js` `keyboard.js` `mouse.js` `clipboard.js` `title.js` `svg.js` `html.js` `format/` `layout/` `shape/` `ui/` `command/` `backend/` `my-mind.js` `index.html` `editor.html`）— これが実際に動く本体機能
2. **新: Solid.js SPAの骨組み**（`main.jsx` `routes/Home.jsx` `routes/Login.jsx` `lib/pb.js`）— まだログイン画面と空のHomeだけ

さらに `vite.config.js` は `root: "src"` で `my-mind.js` と `toast.js` の2エントリのみをビルドしており、`frontend/index.html`（`/src/main.jsx` 参照）はビルド対象に入っていません。出力先も `internal/handler/dist` なのに `assets.go` は `internal/assets/dist` を embed していて、ここも既に食い違っています。

つまり「ディレクトリ構造をSolid.js標準形に書き換える」だけでは終わらず、**①旧エンジンの置き場所 ②vite設定の統合 ③配信経路の整合**まで踏み込まないと動くものになりません。段階を分けて進めます。

---

## 進め方（各フェーズごとにコミット可能な単位にする）

### Phase 1 — 土台のvite設定だけ直す（挙動は変えない）
- `root` を `frontend/src` から `frontend/` に変更し、`frontend/index.html`（既存の `/src/main.jsx` を読む版）を正式なエントリにする
- `rollupOptions.input` から `server`（旧my-mind.js）を一旦外さず残す（Phase 3まで旧エンジンは動かし続けたいので）
- ビルド出力先 (`internal/handler/dist`) と `internal/assets/assets.go` のembed先 (`internal/assets/dist`) の不一致を確認・記録するだけ（直すのはPhase 5）

### Phase 2 — 空のディレクトリを用意する
```
frontend/src/components/   # 新規（今は空 or Button等の骨格のみ）
frontend/src/lib/          # 既存 pb.js はここのまま
```
`public/` は現状どおり（theme.css / my-mind.css / map.css / catalog.css / editor.css / favicon.svg）で問題なし。CSS変数ベースの設計は壊さない。

### Phase 3 — 旧エンジンを丸ごと `src/lib/mindmap/` へ移設（中身は書き換えない）
CLAUDE.mdの「work in progress」に書かれている通り、**マインドマップ関連コードはlibに移すだけ**で、Solidのリアクティブな書き直しはまだしません（そこまでやると差分が大きすぎて壊れたときの切り分けが困難になるため）。

Phase 3の方針（**旧マインドマップエンジンはロジックをSolid化せず、そのままlib配下にvanilla JSとして残し、Solidからは起動関数を呼ぶだけ**）で進めて問題ない


移設対象：
```
src/lib/mindmap/
  ├── my-mind.js (boot()関数をexportする形に変更)
  ├── item.js, map.js, action.js, history.js, pubsub.js
  ├── keyboard.js, mouse.js, clipboard.js, title.js
  ├── svg.js, html.js
  ├── format/, layout/, shape/, ui/, command/
  └── backend/{backend.js, image.js, pocketbase.js}
```
- `editor.html`（notesのiframe用）は静的ページとして `public/editor.html` に移す（iframeで読み込むだけなので、これはSolidコンポーネント化しない）
- `frontend/src/index.html`（旧エントリ）はこの時点で削除し、代わりに `src/components/MindMapCanvas.jsx` のような薄いSolidラッパーを作り、`onMount` で `lib/mindmap/my-mind.js` の起動関数を呼ぶだけにする

### Phase 4 — ルーティングに組み込む
- `main.jsx` の `<Route path="/" component={Home} />` に加え、マインドマップ編集画面用のroute（例: `/m/:id`）を追加し、`MindMapCanvas` をマウントする
- `Home.jsx` はカタログ（マップ一覧）表示にする

### Phase 5 — 配信経路の整合（バックエンド側）
- `vite.config.js` の出力先と `assets.go` のembed先を一致させる（どちらかに合わせる）
- 旧 `toast.js` エントリは、`docs/legacy-ssr-frontend`（もう配信されていない）専用だったため、この時点で削除可能か確認

### Phase 6 — 不要物の掃除
- `frontend/src/index.html`、二重化していたCSSの参照、使われなくなった旧command/backend系の重複コード確認（CLAUDE.mdの「重複コード・未使用コードの削除を優先」に対応）

保留（あとで対応）:
- Tailwind v4の @theme ブロックへ --color-bg 等のトークンを正式移植する作業
- outDir と assets.go のembedパス不一致（Phase 5）
- frontend/src/index.html（旧エントリ）の削除（Phase 3）


