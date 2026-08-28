# 設計の方向性


マインドマップを、Solid.js用のライブラリとして他のプロジェクトにもつかってもらうように洗練させたい。このライブラリを使うとき、できるだけ、余計なブリッジをたさずにそのまま使えるようにしたい。

２つの点を考慮する必要がある。

* マインドマップライブラリの典型的なAPIパターンを踏襲する。
* Solid.js用ライブラリの典型的なAPIパターンを踏襲する。

これは、Solid.js用ライブラリなので、直接シグナルやストアをエクスポートしておいたほうが汎用性が高いと思う。

まず現状を「2つの典型パターン」に照らして診断すると、ズレているのは主に3点です。

## 診断

**1. モジュールレベルsingletonが「ライブラリ」の前提を壊している**

`index.js`は`currentItem`/`setCurrentItem`のような**モジュールスコープの既定インスタンス**をフラットにexportしています。これは今のsolid-mindアプリ（1インスタンスしか要らない）には便利ですが、「他プロジェクトが使うライブラリ」としては致命的です。同じページに2つ目のマインドマップを置いた瞬間に状態が共有されてしまう。Solid製ライブラリ（Kobalte, solid-primitives等）は原則として**グローバル可変状態を一切持たず**、`createXxx()`ファクトリが呼ばれるたびに独立したクロージャを返します。`createMindMap()`自体はこの形にできていますが、`index.js`がそれとは別に「後方互換のための default singleton」を今も主役級にexportしているのが問題です。

**2. `register*`系のブリッジがpublic APIの表面に出ている**

`navigation.js`の`registerNavigate`、`ui/notes.js`の`registerEditorAPI`、`ui/io.js`の`registerRestoreRoot`——これらは「Solidコンポーネントツリーの外にいるvanilla moduleに、後からコールバックを注入する」ためのパターンで、CLAUDE.mdの設計判断としては妥当ですが、**ライブラリの利用者から見ると「隠れた副作用のある関数」**です。典型的なSolidライブラリなら、これは素直に`createContext`/`useContext`か、コンポーネントのprops（`onNavigate`など）で解決します。「余計なブリッジを足さずに使える」という要件と正面から矛盾するのはここです。

**3. `scope.js`の“いま誰がアクティブか”がモジュールレベルの単一状態**

`document`にcapture phaseで貼るclipboardリスナーはブラウザAPI上どうしても1つしかありえないので、これ自体は仕方ないのですが、「複数マインドマップが同一ページに存在しうる」ことを一級市民として設計に組み込む必要があります。

---

## 提案する設計：2層API

Solid界隈で実績のあるパターン（Kobalte, TanStack, solid-primitives）は共通して「**headless coreとrenderer/UIを分離し、coreはsignal/storeをそのまま返す**」形です。これに寄せます。

### 層1: headless core — `createMindMap(initialData?)`

```js
const mindmap = createMindMap(initialData);
// mindmap.root         -> Accessor<ItemNode>  (createStoreでもcreateSignalでも可)
// mindmap.currentItem  -> Accessor<ItemNode | null>
// mindmap.selectedItems -> Accessor<Set<ItemNode>>
// mindmap.canUndo / mindmap.canRedo -> Accessor<boolean>
// mindmap.actions.insertChild(parent, index) / .setText(item, text) / ...
// mindmap.undo() / mindmap.redo()
// mindmap.toJSON() / mindmap.fromJSON(json)
```

ポイントは**「アクセサ関数（シグナルのgetter）をそのままフィールドとして公開する」**ことです。ユーザー側で`createEffect(() => console.log(mindmap.currentItem()))`のように**素のSolidプリミティブとして直接組み合わせられる**のが、「Solidライブラリ的パターン」の核心です。独自のevent bus（`.on("select", cb)`のような、典型的な非Solid製mindmapライブラリ——mind-elixir等——にありがちなAPI）は不要です。Reactivityそのものがイベント機構を兼ねるので、ラップし直す意味がありません。ここは「Solidライブラリのパターンを踏襲する」が「典型的mindmapライブラリのパターン」に優先すべき点です。

一方で、**「典型的mindmapライブラリのパターン」を踏襲すべき箇所**は主にシリアライズ側です：`toJSON()/fromJSON()`という素直なデータ交換契約（mind-elixirの`getData()/init()`、freemindのXML相当）は维持してよい——ここはSolid固有の話ではなく「木構造を永続化する」という普遍的な関心事なので、ライブラリ非依存の形（プレーンオブジェクト）で公開するのが正解です。

`instance.js`の現状の実装（history/selection/viewport/actions/edit/clipboard/mouseを束ねる）はこの方向にかなり近いので、**大きく作り直す必要はなく**、「default singletonの方をやめて、これを唯一の入口にする」というのが最初の一手になります。

### 層2: 任意のrenderer — `<MindMapView instance={mindmap} active={boolean} />`

既存の`NewMindMapPreview.jsx`をベースに、`instance`をpropsで受け取るだけの形に整理します（現状すでにio.js呼び出し等をコールバックへ追い出す作業が進んでいるので、その延長）。`active`propは「このインスタンスが今キーボード/クリップボードの所有者かどうか」を**外部から明示的に渡す**——`scope.js`の`isCanvasActive()`がアプリ側の`activeMode`を覗きに行く逆依存を断ち切る、というdocsの計画そのものです。これで複数`<MindMapView>`を同時にマウントしても、`active`を1つだけtrueにすれば安全に共存できます。

## Context is bridgeの代替になる

`register*`系を置き換える先は、propsで足りるところはprops、コンポーネント階層をまたいで配る必要があるところ（例えばツールバーが`instance`を触りたいが、`<MindMapView>`の外にある）は**Solid Context**にします：

```js
export const MindMapContext = createContext();
export function useMindMap() {
  const ctx = useContext(MindMapContext);
  if (!ctx) throw new Error("useMindMap must be used within <MindMapProvider>");
  return ctx;
}
```

これなら`TopBar.jsx`の"Undo"ボタンのような外部UIも、`registerXxx`という命令的な注入なしに`const { canUndo, undo } = useMindMap()`と書けます。**これが「ブリッジを足さずに使える」を最も直接的に満たす仕組み**です。ノート編集(`ui/notes.js`)のような、そもそもコアの関心事ではない機能は、ライブラリのスコープ外に置く——これは`01-plan.md`の合意ともそのまま一致します。

## 拡張ポイントはregistryとして正式公開

`layoutRepo`/`shapeRepo`を生の`Map`としてexportしている現状は、「初見のユーザーが安全に拡張する方法」が見えません。典型的なmindmapライブラリ（や多くのプラグイン機構）に倣い、

```js
export function registerLayout(layout) { ... }
export function registerShape(shape) { ... }
```

という関数を公開し、Mapそのものは内部実装として隠す方が、ライブラリのAPIとして筋が良いです。

## まとめ：優先順位

1. `index.js`からdefault singleton exportを削除し、`createMindMap()`だけを一次APIにする（一番効果が大きく、後方互換を切るだけで済む——CLAUDE.mdの「後方互換性は維持しなくてよい」方針とも合致）。
2. `register*`系ブリッジをprops/contextに置き換える（`01-plan.md`のStep 4がそのまま該当）。
3. `scope.js`の`active`をprop経由の明示的な値にする（Step 2で概ね着手済み）。
4. `layoutRepo`/`shapeRepo`をregistry関数でラップする。
5. `<MindMapView>`をheadless coreの薄いconsumerとして完成させ、CSSはpackage側で`mindmap-engine/style.css`として出荷する。

この順で進めれば、今の`instance.js`/`docs/mind-map-core-engine-library/`のロードマップをほぼそのまま活かしつつ、「よそのプロジェクトがimportしてそのまま使える」状態に到達できます。
