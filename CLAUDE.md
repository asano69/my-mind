# Overview


## Rules

- データベースのマイグレーションはPocketBaseのWEB UIから行うのでマイグレーションコードを作成する必要はまったくない。
- 後方互換性は維持しなくてよい。
- When fixing bugs, add a failing regression test first.
- All errors are user-facing, so messages should be clear.
- Keep functions small and focused.
- Module files should re-export what's needed, hide implementation details.
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

# タイトル編集不可バグ：調査・修正の段階計画

## まず整理：現状のコードから分かっていること

- `TopBar.jsx` の `<input>` は Solid の **controlled input** で、表示値は `title` という TopBar 内ローカルの signal。
- `title` は2箇所からしか更新されない
  1. `onInput` → `setTitle(e.target.value)`（ユーザーの入力）
  2. `title.js` の `createEffect(() => { ... inputAPI?.setValue(title); })` → `currentTitle()`（store.js）が変わるたびに **強制的に上書き**
- `currentTitle()` 側は `io.js` の `setCurrentTitle()` からしか変わらず、その呼び出し元は `setTitle()`（blur時のcommit）と `setCurrentMap()`（保存完了時・マップ読み込み時）。
- `TopBar` は Workspace 直下の常設コンポーネントで、`MindMapCanvas`（キャンバスのコンテナ `containerRef`）とは兄弟関係にあり、`containerRef` の子ではない。
- `keyboard.js` は `containerEl` に対して自己修復フォーカスガード（`focusout` → `document.activeElement === document.body` なら `container.focus()`）を持っており、これは `activeMode` に関わらず常時有効。

この時点で「タイトル入力ができない／モードで挙動が変わる」を説明しうる仮説が複数あり、どれが実際の原因か **コードを読むだけでは確定できません**。推測で直しに行くとCLAUDE.mdの「バグ修正の前に失敗する回帰テストを書く」の精神にも反するので、まず切り分けフェーズを入れます。

---

## Phase 0 — 事実確認（コード変更なし）

目的：3つの仮説のうちどれが実際に起きているかを、最小限のログで確定する。

1. `TopBar.jsx` の `onInput` の先頭に一時的に `console.log("input event fired", e.target.value)` を追加。
2. `title.js` の `createEffect` 内、`inputAPI?.setValue(title)` の直前に `console.log("title effect fired, currentTitle=", title)` を追加。
3. `keyboard.js` の `handleFocusOut` の中、`container.focus()` を呼ぶ分岐に `console.log("focus stolen back to container")` を追加。

再現手順ごとにログを比較する：

| 観察したいこと | 判定 |
|---|---|
| クリック直後に `focus stolen back to container` が出る | → **仮説B（フォーカス奪取）** が濃厚 |
| キー入力のたびに `input event fired` は出るが、直後に `title effect fired` が出て値が古いものに戻る | → **仮説A（currentTitleスナップバック）** が濃厚 |
| `input event fired` すら出ない（イベント自体が届いていない） | → **仮説C（ヒットテスト/pointer-events）** が濃厚 |

この結果によって Phase 1 以降のうち **どれか1つ**だけを実施すればよくなる。憶測で全部直すと不要な変更が増えるので、ここで一度立ち止まる。

---

## Phase 1（仮説A用）— `title.js` の一方向同期が編集中の値を潰す場合

### 原因のメカニズム
`currentTitle()` は保存完了時 (`setCurrentMap`) にも更新される。オートセーブはキャンバス側の編集で `dirtyVersion` が変わるたびに約1秒後に走るため、「キャンバスでノードを編集した直後にタイトルを触る」といったタイミングで `title.js` の effect が再発火し、まだ blur していない（＝コミットされていない）ローカル `title` を古い値で上書きしてしまう。

### 修正方針
- `title.js` の effect が **ユーザーが今まさに入力中かどうか** を知らずに一方的に上書きしているのが根本原因。入力中は上書きしないようにする。
- 具体的には `TopBar.jsx` 側で「フォーカス中は外部からの `setValue` を無視する」ガードを `registerInput` の API に追加する（`inputAPI.setValue` の実装側で `document.activeElement === inputRef` なら no-op にする）。

### 手順
1. 失敗する回帰テストを先に書く：`title.test.js` を新設し、`registerInput` 経由の `setValue` が「フォーカス中は無視され、blur後は反映される」ことを検証（DOM操作は既存の `item.test.js` 等と同じ mock パターンを流用）。
2. `TopBar.jsx` の `registerInput` 呼び出しを、`setValue` 内で focus 状態をチェックするようラップする。
3. 手動確認：ノード編集→即タイトルクリック→入力、を繰り返しても消えないこと。

---

## Phase 2（仮説B用）— `keyboard.js` のフォーカス自己修復ガードが誤発火する場合

### 原因のメカニズム
`containerEl` の `focusout` ガードは「他に正当なフォーカス先がない場合のみ `container.focus()` する」ことを意図しているが、`document.activeElement === document.body` という判定だけでは、**フォーカス遷移が同期処理の重さ等で瞬間的に乱れるケース**（例：ノード編集中に `stopEditing()` が `blur()` を呼びつつ重い同期処理を挟む）を誤検知しうる。また、この判定は `activeMode` に関わらず常に有効なため、Notes モードでも同様の競合が起こりうる。

### 修正方針
- ガード条件を「`document.body` になった」ではなく「**フォーカス先が `containerEl` の外の実在するフォーカス可能要素でない**」に変える方が意図に忠実。具体的には、`document.activeElement` が `document.body` の場合に加えて、`containerEl` 自身になっている場合以外は再フォーカスしない、という単純化ではなく：

```js
// containerEl 外の正当なフォーカス対象（title input 等）に
// フォーカスが移った場合は絶対に奪い返さない。
queueMicrotask(() => {
  const active = document.activeElement;
  if (active === document.body || active === null) {
    container.focus();
  }
});
```
は現状と同じロジックなので、これでは直らない可能性がある。真因が「一瞬 body に落ちてから title にフォーカスが移る」なら、マイクロタスク1回では間に合っていない可能性もある。その場合は **rAF 1フレーム待ってから判定する**（描画確定後に判定する）方が確実。

### 手順
1. 回帰テストを先に書く：`keyboard.test.js` に、「`focusout` 発生時、`document.activeElement` が一時的に `document.body` になった後、同一マイクロタスク内で外部要素にフォーカスが移るケースでは `container.focus()` を呼ばない」ケースを追加（fake timer / 複数マイクロタスクを模擬）。
2. `handleFocusOut` を `queueMicrotask` → `requestAnimationFrame` に変更するか、判定を2段階（マイクロタスク→もう一段階待って再チェック）にする。
3. 手動確認：ノード編集中にタイトルをクリックしてすぐ入力できること。

---

## Phase 3（仮説C用）— クリックイベント自体が input に届いていない場合

### 原因のメカニズム
`Workspace.jsx` の キャンバス用ラッパー `<div class="fixed inset-0" ...>` は Canvas モード中 `pointer-events-none` が外れ、画面全体を覆う。`TopBar` の `<input>` は `z-index:10` で兄弟要素として後に描画されているため通常はヒットテストで勝つはずだが、`RightPanel.jsx` の `#ui` や `ContextMenu`／`SaveDialog` など、**キャンバスラッパーの内側にあり z-index が個別に設定された要素**（`.pane` は `z-index:5`）が予期せず画面全体を覆っていないか確認する。

### 手順
1. ブラウザの DevTools で `document.elementFromPoint(x, y)` をタイトル座標に対して実行し、実際に input が返るか確認。
2. 返らない場合、どの要素が覆っているかを特定し、その要素の `pointer-events` もしくは `z-index` を修正する。
3. 回帰テストはDOM構造の問題なので自動テスト化は難しく、手動確認のみでよい（CLAUDE.mdの通り、必要なら Playwright 等の導入を別途検討）。

---

## 共通の最終確認チェックリスト（Phase 1〜3のうち適用したものが終わった後）

- Canvas モードでタイトルをクリック→即座に文字が入力できる（何度か素早く入力しても消えない）。
- Notes モードでも同様に、初回クリックから編集できる（「数回クリックしないと効かない」が再現しないこと）。
- Canvas ⇄ Notes を素早く往復した直後でもタイトル編集が壊れない。
- キャンバス側でノードを編集した直後（オートセーブが1秒後に走るタイミング）にタイトルを編集しても値が巻き戻らない。
- 通常のノード編集・ショートカット操作に副作用がないこと（特に Phase 2 を適用した場合、`keyboard.js` のフォーカス復帰が本来必要な場面で動かなくならないか）。

---

## 進め方の提案

まず **Phase 0 のログ追加だけ** を入れて実際に再現させ、どのログが出るかを教えてください。それによって Phase 1〜3 のうちどれが該当するかが確定し、そこだけを Search/Replace 形式のdiffとして出します（複数の仮説を同時に直すと、どの変更が効いたのか切り分けられなくなるため、CLAUDE.mdの「小さく刻む」方針に沿って1つずつ進めるのがおすすめです）。

