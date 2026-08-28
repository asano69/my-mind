# マインドマップコアエンジンのライブラリ化

前回の案は「今の singleton モジュール群にインスタンス概念を後付けする」発想でしたが、それだと結局 `store.js`/`itemSelection.js`/`newMouse.js`/`io.js` といった **アプリ固有の関心事とエンジンの関心事が混ざったまま** インスタンス化することになり、複雑さが増すわりに「ライブラリとして持ち出せる」形にはなりません。

目的が「ライブラリ化」なら、順序を逆にすべきです。

> エンジンをアプリから完全に独立した「グローバル状態を一切持たないモジュール」として設計し直す。マルチインスタンス／タブ切り替えは、そのライブラリを N 回 instantiate すれば自動的に手に入る副産物として扱う。

これは単なる言い換えではなく、実装方針が変わります。「タブ管理機構を作る」のではなく、「エンジンが singleton であることをやめる」ことがゴールになる。

## 1. ライブラリとアプリの境界線を引き直す

今の `frontend/src/lib/mindmap/` を棚卸しすると、すでに大きく2層に分かれています。

**すでにエンジン純度が高い（ライブラリ候補）**
- `core/itemStore.js`（ItemNode、DOM非依存のツリーモデル）
- `core/layout/*.js`（純粋レイアウト計算）
- `core/shape/*.js`（純粋スタイル計算）
- `core/newAction.js`（Command パターンのdo/undo）
- `core/dragPlacement.js`（純粋ドロップ判定）
- `core/urlUtils.js`
- `components/NewMindMapPreview.jsx`（JSXレンダラ本体、ただし `io.js`/`store.js` への依存が混入している）

**アプリ固有（solid-mind 専用、libraryが知るべきではない）**
- `ui/io.js`（PocketBase保存、URL書き換え、`beforeunload`）
- `ui/notes.js` + `NotesEditor.jsx`（EasyMDE、ノート編集）
- `backend/pocketbase.js`
- `store.js` のうち `catalogListVersion`/`snapshotsListVersion`/`leftPanelHidden` 等 UI chrome の状態
- `newContextMenuCommands.js`（"save"/"catalog-list"/"go-to-catalog" のようなアプリ機能とエンジン操作が同じ repo に同居している）
- `title.js`（`document.title` はブラウザタブの話であってエンジンの話ではない）

**混在していて要分離**
- `core/itemSelection.js`, `core/history.js`, `core/newViewport.js`, `core/newMouse.js`, `core/newKeyboard.js`, `core/newClipboard.js`, `core/scope.js`
  → ロジック自体は純粋にエンジンの仕事だが、**module-scope の可変状態（singleton）として実装されている**のが問題。ここがまさに「本当のインスタンス化対象」です。

ライブラリ化の一番の作業は、この最後のグループを **ファクトリ関数（クロージャでstateを閉じ込める）に書き換えること**そのものです。前回案の「MapInstance」はここでも登場しますが、位置づけが違います。「アプリの都合でタブごとに分ける」のではなく、「ライブラリとして最初からグローバル状態を持たない」結果として、複数生成できるのは当然、という話になります。

## 2. ライブラリの公開APIの形

大枠としてはこういう形になるはずです（実装詳細ではなく形の議論として）。

```
createMindMap(options?) -> MindMapInstance
```

`MindMapInstance` が内部に持つもの：
- ツリー（`ItemNode` ルート、`toJSON()`/`fromJSON()` で永続化はホスト側に委譲）
- 選択状態（`currentItem`/`selectedItems`/`editing` の signal）
- 履歴（`push`/`back`/`forward`/`canBack`/`canForward`）
- ビューポート（position/zoom）
- action dispatch（`action(new SetText(...))` 的なAPI）
- `domRefs` 相当の内部登録テーブル

そして描画・入力のためのコンポーネント：
```
<MindMapView instance={instance} active={boolean} />
```

ここでの `active` prop が重要です。今の `scope.js`（`isCanvasActive()`）はエンジン側が「アプリ全体のダイアログ状態」を覗き見て自分の有効/無効を判断する設計になっていますが、これは**ライブラリが持つべき依存の向きが逆**です。ライブラリは「今アクティブかどうか」を外から教えてもらうだけにし、「他のダイアログが開いているかどうか」といったアプリの都合はホスト側（solid-mind本体）が判断して `active` prop に渡す。これによって：

- keyboard/mouse リスナーは `active` な instance のときだけ効く
- clipboard（document capture phase での cut/copy/paste）は本質的にウィンドウに1つしかありえないブラウザAPIなので、ライブラリ側で「今アクティブな instance がどれか」を1つだけ購読する薄いブローカーを用意し、ホストがどの instance をアクティブにするか切り替えるだけで済む

これなら `newMouse.js`/`newKeyboard.js`/`newClipboard.js` のロジック自体（ドラッグ判定、キーバインド、cut/copy/pasteの中身）はほぼ無改造で、「module変数」を「instance毎のクロージャ変数」に移すだけで済みます。

## 3. ノートエディタの位置づけを下げる

これは今回の合意点として明確にしておきたいです。

- `notes` フィールド自体（`ItemNode.notes`）はツリーのデータモデルの一部として**ライブラリに残す**（データとして持つことと、それを編集するUIを提供することは別問題）。
- しかし「ノート編集モード」「EasyMDE統合」「`activeMode: canvas | notes` という2枚看板構造」は **ライブラリのスコープ外** とし、ホストアプリ（solid-mind）側の機能として `notes` フィールドを読み書きするだけの薄い外付け機能にする。
- 現状 `store.js` の `activeMode` はエンジンの `isCanvasActive()` 判定にまで食い込んでいますが、ライブラリ化後は「エンジンは自分がactiveかどうかしか知らない」「notesモードかどうかはホストの関心事」に整理される。結果的に、ノートエディタ機能はマルチタブでも「アクティブタブの内容を映す1枚のエディタ」のままで良く、**per-tab化する必要がそもそも無くなる**。

つまりノートエディタは「後回しにする」というよりも、「そもそもライブラリの設計に影響を与えないよう構造的に切り離す」対象として扱うのが正しいと思います。優先度を下げるというより、**関心事として最初から別レイヤーに置く**という表現の方が正確です。

## 4. ディレクトリ構成の提案

`frontend/src/lib/mindmap/` を将来的に別パッケージとして切り出せる粒度で再編成します（今すぐ別npmパッケージにする必要はなく、pnpm workspace内の別パッケージにするだけでも十分に「ライブラリとして扱っている」という規律が働きます）。

```
frontend/
  packages/
    mindmap-engine/          # ライブラリ本体。solid-mind固有のimportを一切持たない
      src/
        model/               # 旧 core/itemStore.js, layout/*, shape/*
        actions/             # 旧 core/newAction.js
        instance.js          # createMindMap() ファクトリ、旧 itemSelection/history/viewportをここに集約
        input/               # 旧 newMouse.js, newKeyboard.js, newClipboard.js（ファクトリ化）
        MindMapView.jsx       # 旧 NewMindMapPreview.jsx から io.js 依存を除去したもの
        format/              # plaintext 等
      index.js               # 公開APIのみexport
  src/                        # solid-mind アプリ本体（ライブラリの利用者）
    lib/mindmap-app/
      io.js                  # PocketBase保存、旧ui/io.js
      notes.js / NotesEditor.jsx
      tabs.js                # 新規：開いているinstanceの一覧とアクティブ切り替え
      commands.js            # 旧newContextMenuCommands.jsから「アプリ機能」部分を分離
```

`packages/mindmap-engine` からの import は「`index.js` が export しているものだけ」というルールを敷けば、うっかり `store.js` や `io.js` を engine 側が参照してしまう事故を構造的に防げます（今の混線の再発防止）。

## 5. 段階的な進め方（前回案の修正版）

前回はタブUIを先に作る前提でしたが、今回の目的に合わせると **「タブUIは最後」** にすべきです。ライブラリとしての独立性が保たれていれば、タブ機能自体はホストアプリ側のごく薄いコードで済むはずだからです。

1. **フェーズ0：境界線の可視化のみ**（コード変更ゼロでもよい）
   `core/*` のうちどれが「純粋エンジン」でどれが「アプリ混入」かをファイル単位で確定する。今回の棚卸しがこれに相当。
2. **フェーズ1：mixed-concern モジュールの分離**
   `newContextMenuCommands.js` を「エンジン操作コマンド（engine repo）」と「アプリ機能コマンド（save/catalog/help等、app repo）」に分割。`scope.js` の「他のUIが今アクティブか」判定を「外から `active` を渡される」形に反転。
3. **フェーズ2：singletonのファクトリ化**
   `itemSelection.js`/`history.js`/`newViewport.js`/`newMouse.js`/`newKeyboard.js`/`newClipboard.js` を `createMindMap()` の内部状態に畳み込む。この時点ではまだ instance は1個しか生成しない（挙動不変であることの確認が目的）。
4. **フェーズ3：`ui/io.js`/`ui/notes.js` をアプリ側専用モジュールとして再配置**
   ライブラリ側は `toJSON()`/`fromJSON()` と action API だけを露出し、保存・自動保存・ノート編集は完全にアプリ側の責務にする。
5. **フェーズ4：パッケージ境界の物理的分離**
   `packages/mindmap-engine` として実際にディレクトリを切る（あるいは import ルールをlintで縛るだけでも可）。
6. **フェーズ5：タブUIの実装**
   ここに来て初めて `tabs.js` と `<For each={openTabs()}>` によるタブ切り替えを実装。フェーズ4までが正しくできていれば、この段階の作業は本当に薄いはずです。

## 6. 決めておきたい論点

- **ライブラリの永続化フォーマットは "mymind" JSON をそのまま踏襲するか？**（互換性を切ってでもクリーンな形にするか、CLAUDE.mdの「後方互換性は維持しなくてよい」方針が使えるはずなので、この機会に schema を見直す余地もある）
- **`notes` フィールドをライブラリのデータモデルに残すか、完全に外に出す（"userData: any" のような汎用フィールドにする）か？** 前者の方が移行コストは低いが、"ノート"という概念そのものをライブラリが知っている点でやや不純。
- **`scope.js` の「ダイアログが開いている間は入力を奪わない」機構を、ライブラリ側の `active` prop 一本にどこまで単純化できるか。** 現状はform-field/dialog/title-editなど細かい scope 種別があるが、ライブラリからすれば「active か not-active か」の二値で十分なはず。
- **別npmパッケージとして実際に切り出す（`pnpm workspace` 化）タイミングをいつにするか。** 早すぎるとビルド設定の手間だけが増える、遅すぎると「境界線」が緩みやすい。`pnpm-workspace.yaml` が既に存在するので技術的障壁は低いはず。

---

# フェーズ0：境界線の可視化

`frontend/src/lib/mindmap/` 配下と、それに直結する `components/` を全ファイル棚卸しし、5分類に仕分けます。コード変更はゼロ、分類とその根拠（具体的にどの import が違反かを含む）だけを出します。

## 分類基準

| 記号 | 分類 | 定義 |
|---|---|---|
| 🟢 | **純粋エンジン** | app側への依存が一切なく、そのまま切り出せる |
| 🟡 | **要ファクトリ化** | ロジックはエンジンの仕事だが、module-scope singleton として実装されている（app依存はない） |
| 🔴 | **アプリ混入エンジン** | エンジンの仕事のはずのファイルなのに、app固有のモジュール（`store.js`, `ui/io.js`, `backend/*`）を直接importしている |
| ⚪ | **アプリ専用** | ホストアプリ（solid-mind）の関心事。ライブラリが知る必要はない |
| ⬛ | **無関係** | マインドマップ機能そのものと関係ない別機能 |

---

## 🟢 純粋エンジン（そのまま切り出せる）

| ファイル | 根拠 |
|---|---|
| `core/itemStore.js` | shape/layout/formatのみ参照。ItemNodeは各インスタンスが自前のsignalを持つクラスであり、module-scope stateを持たない。**唯一、既に「複数生成」に対応済みのファイル** |
| `core/layout/layout.js`, `graph.js`, `tree.js`, `map.js`, `constants.js` | 引数から純粋計算、他のcore以外への依存なし |
| `core/shape/shape.js`, `box.js`, `ellipse.js`, `underline.js` | 同上 |
| `core/dragPlacement.js` | 引数のみで完結する純粋関数 |
| `core/urlUtils.js` | 依存ゼロ |
| `core/format/format.js`, `format/plaintext.js` | core内部のみ参照 |
| `core/*.test.js`（pure-layout, pure-shape, urlUtils, dragPlacement, itemStore） | テスト対象と同じ分類 |

---

## 🟡 要ファクトリ化（singleton shapeなだけで、app依存はない）

module-scope の `let`/モジュールレベル signal を持ち、`init()/dispose()` で使い回している一群。ロジック自体は健全で、**「クロージャに閉じ込めてファクトリ関数にする」だけ**で済むはず。

| ファイル | module-scope stateの実体 |
|---|---|
| `core/history.js` | `let index`, `let actions`, `historyVersion` signal |
| `core/itemSelection.js` | `currentItem`, `selectedItems`, `selectionCursor`, `editing` の各signal |
| `core/newViewport.js` | `node`, `position`, `zoomScale`, `lastRootContentPosition`, `getRootSize`/`getContainerSize`（`registerCenterSource`ブリッジ） |
| `core/newAction.js` | state自体は持たないが、`history.js`/`itemSelection.js`（共にsingleton）に直接依存しているため、それらのファクトリ化に引きずられる |
| `core/newEdit.js` | `domRefs`, `activeSession`（同上、history/itemSelection/newActionに依存） |
| `core/newMouse.js` | `current`, `port`, `container`, `domRefsRef`, `getRootFn` |
| `core/newClipboard.js` | `storedItems`, `mode`, `domRefsRef` |
| `navigation.js` | `navigateFn`（`registerNavigate`ブリッジ）— host callbackとして注入される形は残しつつ、per-instance化は必要 |

---

## 🔴 アプリ混入エンジン（最重要・要修正）

「エンジンの仕事のはずなのに、app固有モジュールを直接参照している」箇所。ライブラリ化の作業の**本丸**です。

| ファイル | 混入の中身 |
|---|---|
| **`core/scope.js`** | `import { activeMode } from "../store.js"` — エンジン層からアプリの`store.js`への**唯一かつ直接的な逆方向依存**。`isCanvasActive()`は`newMouse.js`/`newKeyboard.js`/`newClipboard.js`から使われており、この1本の依存線がエンジン全体をアプリに縛り付けている。**最優先で断ち切るべき箇所。** |
| **`newContextMenuCommands.js`** | 同一の`repo`に、エンジン操作コマンド（`bold`/`delete`/`fold`/`undo`/`pan`等）と、アプリ機能コマンド（`save`→`io.quickSave()`, `catalog-list`→`store.js`, `go-to-catalog`→ルーティング, `new`→`navigateTo("/maps/new")`）が同居。`newKeyboard.js`はこの`repo`を`sharedCommandRepo`としてそのままimportしているため、キーボード入力処理そのものがアプリ機能と結合している。 |
| **`components/NewMindMapPreview.jsx`** | エンジンのレンダラ本体でありながら：<br>・`backend/pocketbase.js`の`loadByUuid`を直接呼んでいる（永続化層への直参照）<br>・`ui/io.js`の`attach`/`setCurrentMap`/`init`/`detach`を直接呼んでいる（保存ロジックとの結合）<br>・`store.js`の`bumpDirty`/`titleAuto`/`setCurrentTitle`/`overrideRoot`/`setOverrideRoot`を直接読み書きしている<br>この1ファイルが最も依存が多方向に散っており、分離コストが一番高い。 |
| `core/newKeyboard.js` / `newMouse.js` / `newClipboard.js` | 上記`scope.js`経由で間接的に`store.js`へ依存（🟡の分類理由に加えて、この点でも🔴の要素を持つ） |

---

## ⚪ アプリ専用（ホスト側に残る）

| ファイル | 備考 |
|---|---|
| `store.js` | `currentTitle`/`titleAuto`/`saveStatus`/`autoSaveEnabled`/`dirtyVersion`（保存系）、`leftPanelHidden`/`rightPanelHidden`/`throbberVisible`/`showSnapshots`/`showCatalogList`/`helpHidden`/`valueDialogOpen`/`fileSwitcherOpen`/`errorDialogMessage`/`leaveConfirmOpen`（UI chrome）— **ほぼ全項目がアプリ関心事**。例外は`overrideRoot`（エンジンのrootを差し替えるための橋渡し）と`hoveredItem`（Notes連携用）で、これらは本来エンジンのpublic APIとして提供されるべきものがsignal経由になっている歪み |
| `title.js` | `document.title`同期、`io.setTitle`呼び出し |
| `ui/io.js` | PocketBase保存・自動保存・URL書き換え・`beforeunload` |
| `ui/notes.js`, `NotesEditor.jsx`, `NotesEditor.css` | 合意通りノート機能はアプリ側専用 |
| `ui/toast.jsx`, `components/ToastRegion.jsx` | UI |
| `backend/pocketbase.js`, `backend/image.js`, `lib/pb.js` | 永続化・エクスポート（`image.js`はstyle.cssのカラートークンをハードコード複製しており、ホストのテーマに強結合） |
| `components/MindMapCanvas.jsx` | ライブラリ+アプリUIを組み立てるホスト側コンポーネント。`title.js`と`store.js.activeMode`を読むのは適切（ホストの仕事） |
| `Workspace.jsx`, `TopBar.jsx`, `LeftPanel.jsx`, `RightPanel*.jsx`, `ContextMenu.jsx` | ライブラリの公開APIを使う側のUI。ここが`newContextMenuCommands.js`経由でコマンドを呼ぶのは、コマンドrepoさえ分割されれば問題ない |
| `ConfirmDialog.jsx`, `ValueDialog.jsx`, `ErrorDialog.jsx`, `LeaveConfirmDialog.jsx`, `FileSwitcher.jsx` | アプリUI（`ValueDialog.jsx`が`core/newAction.js`の`SetValue`を直接使うのは「ホストがライブラリAPIを叩く」正当な形） |
| `SnapshotsList.jsx`, `CatalogList.jsx`, `Catalog.jsx` | スナップショット／カタログ機能 |

---

## ⬛ 無関係（別機能、命名の衝突のみ）

| ファイル | 備考 |
|---|---|
| `lib/noteSchedule.js`, `components/NoteCard.jsx` | マインドマップのnotesとは無関係の、別の「リマインダー/定期通知」機能と思われる。"Notes"という名前が被っているだけ |

---

## 依存関係図（違反箇所だけ抜粋）

```
[アプリ層]  store.js ←──────────┐
              ↑                  │ (逆方向依存！)
              │ 正常な参照         │
[アプリ層]  ui/io.js, backend/*   │
              ↑                  │
              │ 正常な参照         │
[???]      NewMindMapPreview.jsx ─┘  core/scope.js ──┘
              │
              │ 本来はここだけを参照すべき
              ↓
[エンジン層] core/itemStore.js, layout/*, shape/*, newAction.js, ...
```

`NewMindMapPreview.jsx`と`core/scope.js`の2箇所が、エンジン→アプリの矢印を作ってしまっている震源地です。

---

## この棚卸しから見える優先順位

1. **`core/scope.js`の`activeMode`参照を外す**のが最小コストで最大効果。`isCanvasActive()`を「外から渡される`active`フラグを見るだけ」に変えれば、`newMouse.js`/`newKeyboard.js`/`newClipboard.js`の🔴要素は自動的に消える。
2. **`newContextMenuCommands.js`をengine repo / app repoに分割**すれば、`newKeyboard.js`の🔴要素が消える。
3. **`NewMindMapPreview.jsx`から`backend/pocketbase.js`・`ui/io.js`・`store.js`への直接依存を、props/callback（`onLoad`, `onDirty`, `onTitleChange`, `initialUuid`ではなく`initialData`）に置き換える**のが最も手間がかかるが、これが済めば🔴は実質ゼロになる。
4. 🟡グループ（history/itemSelection/newViewport/newMouse/newClipboard/newEdit）は上記1〜3が終わった後、まとめてファクトリ化すれば良い（依存先が綺麗になっているほど、ファクトリ化自体は機械的な作業になるはず）。

この並び、つまり「🔴を先に潰してから🟡をファクトリ化する」の順番で次のフェーズ（フェーズ1）に進むのが良さそうです。


---

リファクタリングのたびに成果があがるように、コア部分をライブラリとしてしっかり線引きしながら、すこしずつ、ライブラリの部分を広げていく戦略が良いと思う。
# 戦略：境界線を「実体」として先に引き、内側を少しずつ広げる

とても良い方針だと思います。ここで一点、フェーズ0の分類を見返すと重要な気づきがあります。

**「🟡（要ファクトリ化）」と「🔴（アプリ混入）」は、実は別の軸の問題です。**

- 🔴 = **import の向きの違反**（エンジンがアプリを参照している）→ これは「境界線」の問題
- 🟡 = **module-scope singleton である**（アプリへの依存はない）→ これは「複数生成できない」という別の問題

境界線（import方向のルール）だけで言えば、🟡グループ（`history.js`, `itemSelection.js`, `newViewport.js`, `newMouse.js`, `newClipboard.js`, `newEdit.js`）はすでに合格しています。singleton であることは「ライブラリとして未完成」ではありますが、「アプリに汚染されている」わけではない。

これは好都合です。**境界線を「今すぐ」広く引ける**ということだからです。ファクトリ化（🟡→🟢化）は境界線の内側に取り込んだ後で、好きなタイミングで着手すれば良い。境界線を守ることと、singleton を解消することを、別々のマイルストーンとして進められます。

## ステップ1（最初の一手）：境界線を「機械的にチェックされるルール」として実体化する

まずやるべきは、コード変更ではなく **「侵犯したら検知できる仕組み」を作ること**です。これ自体が最初の目に見える成果になります。

具体的には ESLint の `no-restricted-imports`（あるいは `eslint-plugin-boundaries`）で、こういうルールを敷きます。

- `frontend/src/lib/mindmap/core/**` からは、`../store.js`, `../ui/*`, `../backend/*`, `../title.js` を import 禁止
- 例外を許すファイルは無し（今は0個であるべき）

この時点で `core/scope.js` の `import { activeMode } from "../store.js"` が **即座にlintエラーとして可視化**されます。これが「境界線の実在化」です。CIに組み込めば、以後誰かがうっかり逆方向依存を増やしても即座に赤くなる。

この一手だけで：
- 🟢 + 🟡 グループ（`itemStore.js`〜`newClipboard.js`まで）が「ルールで保護された領域」になる
- 唯一の違反者が `core/scope.js` だと機械的に確定する
- 次にやるべき作業が自動的に1点に絞られる

という成果が得られます。コードは1行も変えていないのに、境界線が「口約束」から「検証可能な制約」に変わる。これが「毎回成果が上がる」戦略の第一歩として理想的だと思います。

## ステップ2：`core/scope.js` の依存を反転させる（最初の🔴の解消）

これが実質的な最初のリファクタです。`isCanvasActive()` を「外から `activeMode` 相当の値を注入してもらう」形に変えます。

- 今：`scope.js` が `store.js` の `activeMode()` を能動的に import して読みに行く
- 変更後：`scope.js` は「現在のベーススコープ」を保持する signal を自前で持ち、それを `setBaseScope(value)` のような形で外から書き込んでもらう
- ホスト側（`MindMapCanvas.jsx` あたり）が `createEffect(() => scope.setBaseScope(activeMode()))` のように橋渡しする1行を追加するだけ

この変更のポイントは、**scope.js自身のロジック（pushScope/topScope/isCanvasActiveの中身）は一切変えなくて良い**ことです。変わるのは「値をどこから取得するか」という入力経路だけ。挙動は完全に不変のはずなので、リグレッションテストのコストも低い。

この一手が終わると：
- lintの違反者が0件になる
- 境界線チェックが「グリーン」になったこと自体が2つ目の成果
- `newMouse.js`/`newKeyboard.js`/`newClipboard.js` は `scope.js` 経由で間接的に持っていた🔴要素も同時に消える（連鎖的な効果）

## ステップ3：`newContextMenuCommands.js` を engine repo / app repo に分割する

これも「分割するだけ」で新しいロジックは書きません。今の1つの `Map` を2つに分けます。

- `core/engineCommands.js`（仮）：`bold`/`italic`/`underline`/`strikethrough`/`insert-child`/`insert-sibling`/`delete`/`edit`/`yes`/`no`/`computed`/`undo`/`redo`/`center`/`zoom-in`/`zoom-out`/`fold`/`swap`/`side`/`pan`/`notes`（notesの中身は後述）
- `app/commands.js`（仮、hostアプリ側）：`save`/`help`/`ui`/`recover`/`catalog-list`/`file-switcher`/`go-to-catalog`/`new`

`newKeyboard.js`（🟡グループ）が参照する `sharedCommandRepo` を `engineCommands.js` だけに絞れば、キーボード処理から app 側コマンドへの依存が切れます。`ContextMenu.jsx` 側は両方の repo をマージして表示すれば見た目は変わりません。

ここで唯一悩ましいのが `notes` コマンド（`notes.toggle()` を呼ぶもの）です。これは「ノートは重要だがライブラリのスコープ外」という前回の合意と直結する箇所なので、この機会に **engine repo からも外し、app repo 側に置く**のが筋が通ります。エンジンのキーボードショートカット一覧には現れなくなりますが、ホストが自分のショートカット層で `Ctrl+M` をbindし直せば良いだけです。

## ステップ4：`NewMindMapPreview.jsx` の依存を props/callback に置き換える

これが一番大きい作業なので、最後に回すのが正しいです。ただし一気にやらず、依存を1本ずつ剥がしていくのが「成果が積み上がる」進め方に合います。

現状の直接依存とその剥がし方の対応：

| 現状の直接依存 | 剥がし方 |
|---|---|
| `backend/pocketbase.js` の `loadByUuid` | `props.initialData`（すでにロード済みの `mymind` JSON）を受け取る形に変更。ロード自体はホスト（`MindMapCanvas.jsx`）の責務にする |
| `ui/io.js` の `attach`/`setCurrentMap`/`init`/`detach` | `props.onRootReady(root, svgNode)` のようなコールバックに置き換え。呼ぶタイミング（root確定時、unmount時）は今と同じで良い |
| `store.js` の `bumpDirty` | `props.onDirty()` コールバック |
| `store.js` の `titleAuto`/`setCurrentTitle` | `props.onTitleChange(name)` コールバック（root.nameが変わるたびに呼ぶ） |
| `store.js` の `overrideRoot`/`setOverrideRoot` | これは「エンジンのpublic API」として正式に用意すべきもの。`instance.restoreRoot(newRoot)` のような明示的なメソッドにする |

この表の1行ずつを独立したステップとして片付けられます。全部一度にやる必要はなく、「1本剥がす→テスト→lintグリーン確認」のサイクルを5回繰り返すイメージです。

## 全体の順序と「毎回成果が出る」ことの確認

```
Step 1: lintルール導入          → 違反箇所が可視化される（成果：検証可能な境界線）
Step 2: scope.js の反転         → 違反が1件消える、newMouse/newKeyboard/newClipboardも連鎖的にクリーンに
Step 3: commands repo 分割      → 違反が1件消える、キーボード層がエンジン純度を獲得
Step 4a〜4e: NewMindMapPreview  → 依存を1本ずつ剥がす。5ステップに分割できる
Step 5（任意、後回し可）: 🟡グループのファクトリ化
Step 6（任意）: packages/ への物理分離
```

Step 1〜4が終わった時点で、**「境界線の内側＝ライブラリ本体」がすでに95%完成している**状態になります。singleton（🟡）が残っていても、それは「まだマルチインスタンスに対応していないライブラリ」であって「アプリに汚染されたライブラリ」ではない。この違いは大きく、Step 5（ファクトリ化）は純粋に内部実装の話になるので、境界線を壊すリスクなしに進められます。

## 次にやること

Step 1（lintルールの設計）から始めるのが良いと思います。ESLintの `no-restricted-imports` を使うか `eslint-plugin-boundaries` を導入するかは、プロジェクトの規模的には前者で十分そうです。具体的なルール文面と、`eslint.config.js` へどう追記するかを詰めましょうか。それとも先に Step 2（`scope.js` の反転）の具体的な差分設計に進みますか？