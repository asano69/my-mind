# Overview


## Rules

- データベースのマイグレーションはPocketBaseのWEB UIから行うのでマイグレーションコードを作成する必要はまったくない。
- 後方互換性は維持しなくてよい。
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

フロントエンドからmapsデータを保存するときにsvg画像も一緒に保存したい。svg画像の生成自体は数十ミリ秒でおわるはずだから十分に現実的なはず。

## 設計方針

現状の保存フローはこう:

`item-change` → (1秒デバウンス) → `io.js: performSave()` → `map.toJSON()` → `backend/pocketbase.js: save(id, title, mymind)` → PocketBase

ここに svg 文字列を割り込ませるのが素直。SVG生成ロジックは既に `backend/image.js` の `ImageBackend.save('svg')` にあるので、**そこから低レベルの「SVG文字列を作る関数」を切り出して再利用**するのが一番シンプル。

### 変更点

**1. `backend/image.js` — SVG文字列生成部分を関数として切り出す**

現状 `save(format)` の中に「cloneNode → injectRootVariables → viewBox調整 → serializeToString」までが埋め込まれている。ここを独立関数にする:

```js
export function serializeCurrentMap() {
  const serializer = new XMLSerializer();
  const svgNode = app.currentMap.node.cloneNode(true);
  injectRootVariables(svgNode);
  const p = EXPORT_PADDING;
  const width = svgNode.width.baseVal.value || svgNode.viewBox.baseVal.width;
  const height = svgNode.height.baseVal.value || svgNode.viewBox.baseVal.height;
  svgNode.setAttribute("width", (width + p * 2).toString());
  svgNode.setAttribute("height", (height + p * 2).toString());
  svgNode.setAttribute("viewBox", `${-p} ${-p} ${width + p * 2} ${height + p * 2}`);
  return serializer.serializeToString(svgNode);
}
```

`ImageBackend.save()` はこれを呼んでから base64 化する形に整理(PNG/SVGエクスポートの挙動は変えない)。クラスにする必要のない処理なので、素の関数としてエクスポートするのが一番シンプル。

**2. `backend/pocketbase.js` — svg を保存対象に含める**

```js
export async function save(id, title, mymind, svg) {
  const data = { title, mymind, svg };
  if (id) return pb.collection(COLLECTION).update(id, data);
  return pb.collection(COLLECTION).create(data);
}
```

**3. `ui/io.js: performSave()` — 保存直前にSVGを生成**

```js
import { serializeCurrentMap } from "../backend/image.js";

async function performSave() {
  const map = app.currentMap;
  const mymind = map.toJSON();
  const title = currentTitle || map.name;
  let svg = "";
  try {
    svg = serializeCurrentMap();
  } catch (e) {
    console.warn("failed to generate SVG snapshot:", e);
  }
  try {
    const record = await backend.save(currentMapId, title, mymind, svg);
    ...
```

SVG生成が失敗しても mymind 保存自体は止めない(try/catchで隔離)。

### その他の点

- **`svg` フィールドの型**: 生の `<svg>...</svg>` 文字列をそのまま保存でよい。
- **デバウンスとの相性**: item-change のたびに(1秒間隔で)SVGを再生成するので、編集中は常に「軽いSVGシリアライズ」が走ることになる。数十msなら許容範囲とのことなので問題なし。
- **map非表示時のガード**: `restore()` 直後などまだ `currentMap` が画面に append されていないタイミングで `performSave` が呼ばれることは基本ないはずだが、念のため `map.isVisible` をチェックして空文字にフォールバックしておくと安全。

