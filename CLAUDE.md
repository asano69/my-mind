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
- バックエンドは、go-templateをつかったSSRアプリを前提にした構造から、Solid.jsをつかったSPAを前提にした構造に書き換えている。
- フロントエンドは、Pure JSを使ったレガシーな構造から、Solidの宣言型リアクティビティに置き換える。
- フロントエンドは、マインドマップエンジンのコンポーネント化も進めている。
- 重複コード、未使用コードの削除を優先的に行う。



# Work in progress

## グローバルスコープにイベントリスナーを登録しているモジュールのリファクタリング

MindMapCanvas.jsxと、NotesEdiotr.jsxを、Workspace.jsxの子コンポーネントとしてもたせ、スイッチの切り替えにおうじて編集モードを切り替えるような用途を考えたとき、グロバールリスナーはスコープの制御が難しく、バグの温床になりやすい。グローバルリスナーをローカルスコープに変更するには、SolidJSのコンポーネントライフサイクルを活用し、各モジュールのリスナー登録先を適切なスコープに変更する必要があります。


現在のアーキテクチャでは、`MindMapCanvas.jsx`がマウントされると、以下のグローバルリスナーが登録されます：

- `keyboard.js`: `window`に`keydown`リスナー
- `clipboard.js`: `document.body`に`cut`/`copy`/`paste`リスナー
- `ui.js`: `document`に`click`リスナー
- `my-mind.js`: `window`に`resize`リスナー

Workspace.jsxでスイッチングすると、非表示のコンポーネントのリスナーが残り続け、バグの原因になります。

### ローカルスコープへの変更方法の例

### 1. keyboard.jsのスコープ制限

**変更前:**
```javascript
export function init() {
  window.addEventListener("keydown", handleEvent);
  window.focus();
}
```

**変更後:**
```javascript
export function init(port) {
  port.addEventListener("keydown", handleEvent);
  port.focus();
}
```

`handleEvent`内の`ui.isActive()`チェックを、SolidJSのシグナルベースの状態管理に置き換え、コンポーネントの表示状態に応じて処理を分岐します。 [6](#5-5) 

### 2. clipboard.jsのスコープ制限

**変更前:**
```javascript
export function init() {
  document.body.addEventListener("cut", onCopyCut);
  document.body.addEventListener("copy", onCopyCut);
  document.body.addEventListener("paste", onPaste);
}
```

**変更後:**
```javascript
export function init(port) {
  port.addEventListener("cut", onCopyCut);
  port.addEventListener("copy", onCopyCut);
  port.addEventListener("paste", onPaste);
}
```

`onCopyCut`/`onPaste`内の`ui.isActive()`チェックを、アクティブなコンポーネントを示すシグナルに基づく判定に変更します。

### 3. ui.jsのスコープ制限

**変更前:**
```javascript
export function init(port) {
  // ...
  document.addEventListener("click", onClick);
}
```

**変更後:**
```javascript
export function init(port) {
  // ...
  port.addEventListener("click", onClick);
}
```

UIパネル自体にリスナーを登録し、イベントバブリングを利用して処理します。 

### 4. SolidJSコンポーネントへの統合

MindMapCanvas.jsxで、コンポーネントの表示状態に応じてリスナーを管理：

```javascript
export default function MindMapCanvas() {
  let mainRef;
  let engine;
  const [isActive, setIsActive] = createSignal(true);

  onMount(async () => {
    engine = await import("../lib/mindmap/my-mind.js");
    engine.mount(mainRef);
  });

  createEffect(() => {
    if (isActive()) {
      engine?.keyboard?.init(mainRef);
      engine?.clipboard?.init(mainRef);
    } else {
      engine?.keyboard?.dispose();
      engine?.clipboard?.dispose();
    }
  });

  onCleanup(() => {
    engine?.unmount();
  });
}
```


- 現在の`ui.isActive()`はDOM構造に依存していますが、SolidJSのシグナルベースの状態管理に置き換えることで、DOM依存を減らせます。
- `Pan`コマンドのように動的に`window`にリスナーを登録するケースは、ポート要素に変更する必要があります。 
- `my-mind.js`の`resize`リスナーは、ウィンドウサイズがアプリ全体で共有されるため、グローバルのままでも問題ない可能性があります。ただし、リサイズ時の処理をアクティブなコンポーネントに限定する必要があります。 




## Markodwonエディタをマップの背景にもっていけないか検討
- 現在、マップの背景にマークダウンがプレビューされている。これを廃止する
- かわりにEasyMDEのViewモードをマップの背景に常に表示させてこれをプレビューモードとして使いたい。
- 現在、data-command="notes" を実行すると、手前に、EastMDEが表示されるが、それを廃止する。
- かわりに、 data-command="notes" を実行すると、背後にあるViewモードのEasyMDEがEditモードに切りかわり、MindMapCanvasの手前に表示したい
- 設計上、そのほうが扱いやすいならば、MindMapCanvas.jsxと、NotesEdiotr.jsxを、Workspace.jsxの子コンポーネントとしてもたせ、スイッチの切り替えにおうじて前面背面を切り替えるようにするとよい。

