# docs/08 Phase 4 細分化計画（Phase 5への橋渡し込み）

Phase 4は「mouse/keyboard/clipboard統合 + currentItemの一本化 + ドラッグ&ドロップのDOM参照間接化」を一括りにしていたが、Phase 3で経験した「一気に統合しようとして再帰クラッシュ→設計後退」の再発を避けるため、**各サブフェーズが独立に動作確認できる単位**まで切る。方針は一貫して次の3点。

- 旧エンジン（`item.js`/`my-mind.js`）は最後まで本番経路として残し、新エンジンは`?newEngine=1`配下で並行稼働させ続ける。両者を同時に書き換えない。
- 各サブフェーズは「データ層（itemStore.js）に機能を足す」→「JSX側で配線する」→「テストで固定する」の3ステップを毎回繰り返す。1サブフェーズで両方をやらない。
- doc07（ドロップ判定）・d01（clipboardのdocument capture）・doc06.1（rAF二重待ち）など、既に確立した知見は**ロジックとして再利用**し、置き場所（DOM直接参照→domRefs経由）だけを変える。計算そのものを書き直さない。

---

## Phase 4.0 — 影響範囲の棚卸し（コード変更なし）

`mouse.js`/`keyboard.js`/`clipboard.js`/`command/command.js`/`command/edit.js`/`command/select.js`/`action.js`が`item.dom`・`app.currentItem`・`app.selectedItems`・`item.js`固有のAPI（`startEditing()`/`stopEditing()`/`handleEvent()`）にどこで依存しているかを一覧化する。特に以下は個別の落とし穴として明記しておく。

- `keyboard.js`のフォーカス自己修復ガード（rAFベース、`docs`に記載のタイトル編集不可バグの対策）は新エンジンでも同型の問題（Kobalte Dialogや他フォーカス移動）が起きうるため、そのまま移植対象とする。
- `clipboard.js`が`document`のcaptureフェーズでリッスンしている理由（d01ドキュメント）はDOM/ブラウザ都合であり、新エンジンでも変わらない。
- `mouse.js`のドラッグ判定（doc07の軸マージン方式）は純粋関数ではなく`item.dom.content.getBoundingClientRect()`に依存しているので、Phase 4.7で間接化が必要な箇所として印を付けておく。

リスク: なし。

---

## Phase 4.1 — `domRefs`レジストリの導入（新エンジンのみ）

`item.dom.content`のような直接DOM参照を、`Map<item.id, HTMLElement>`経由の間接参照に置き換える土台を作る。

- `itemStore.js`ではなく、`NewMindMapPreview.jsx`（後にコンポーネント名を変える想定）側に`domRefs`という`Map`を1つ持たせ、`ItemNodeView`の`createEffect`（既存の測定effect）の中で`domRefs.set(item.id, contentRef)`し、`onCleanup`で`domRefs.delete(item.id)`する。
- `domRefs`はまだ何にも使われない。Phase 4.7でmouse.jsのドラッグ判定から参照されるまでは死んだ配線のままでよい。
- テスト: `domRefs`がマウント/アンマウントで正しく追加・削除されることを確認する軽いテストを追加する（実DOM不要、`ref`呼び出しの回数をスパイすれば足りる）。

リスク: 低。既存の描画には一切影響しない純粋な追加。

---

## Phase 4.2 — 選択状態をitemStore側に持たせる（表示のみ、まだクリック未配線）

`app.currentItem`/`app.selectedItems`/`app.selectionCursor`に相当する状態を、新エンジン専用のモジュール（例: `itemSelection.js`、`store.js`とは別ファイルにして旧エンジンのstore.jsを汚さない）に`createSignal`で用意する。

- `currentItem`/`selectedItemIds`（Setではなく`Set`をそのままsignalに入れるとSolidが差分検知できないので、素直に`Set`ごと差し替える形にする）を用意。
- `ItemNodeView`に`classList={{ current: ..., selected: ... }}`を足し、この信号を読んで見た目を反映する。
- クリックはまだ配線しない。手動でsignalを書き換えるテストコードから見た目が変わることだけを確認する（Phase 3.7のtoggle同様、一時的にテスト専用のヘルパー関数から呼ぶ）。

リスク: 低。状態と見た目の結線のみで、入力経路にはまだ触れない。

---

## Phase 4.3 — クリック選択の実配線

`mouse.js`の`onClick`/`onDblClick`相当のロジックを、新エンジン用の小さいモジュール（`newMouse.js`など、後で`mouse.js`と統合するかは4.7以降で判断）に実装し、`ItemNodeView`の`.content`に`onClick`/`onDblClick`を直接JSXの`onClick`propとして貼る（`mouse.js`のような`port`単位のイベント委譲ではなく、Solidらしくノード自身にハンドラを付ける方式を試す）。

- Ctrl/Cmd+クリックでの`addToSelection`、`selectItem`をPhase 4.2のsignalに対して実装する。
- ダブルクリックでの編集開始は、まだ実装しない（Phase 4.5で扱う）。ここでは「選択が変わること」だけを検証する。
- `mouse.test.js`にある「フォーカスハンドオフ」「post-dragクリック抑制」は、まだドラッグを実装していないのでこの段階では対象外。選択そのものの単体テストだけ新規に足す。

リスク: 中。ここで初めて実ユーザー入力が新エンジンに触れる。`isCanvasActive()`によるガード（Notesモード中は無視）を最初から入れておくこと。

---

## Phase 4.4 — キーボードショートカットの移植（非破壊コマンドのみ）

`command/select.js`（矢印キーでの選択移動、`resolvedLayout.pick()`を使う）を最初のターゲットにする。理由: 破壊的操作（削除・挿入）を含まず、`resolvedLayout`は既にitemStore側の`ItemNode`が持っているため、`Item`固有の依存がほぼない。

- `keyboard.js`のcontainerEl scoping、`isCanvasActive()`ガード、IME (`isComposing`) チェックはそのまま移植する。フォーカス自己修復ガード（rAF）もこの時点で一緒に移す（4.0で洗い出した通り、必須の仕組み）。
- `SelectRoot`/`SelectParent`/`Select`/`SelectAdd`の4コマンドを、`app.currentItem`ではなくPhase 4.2/4.3のsignalを読み書きする形で再実装する。
- `keyboard.test.js`のシナリオ（フォーカス自己修復、activeMode !== "canvas"での無視）を新エンジン向けにコピーして通す。

リスク: 中。ショートカットキーの入り口(`keydown`)を新エンジンに持ち込む最初のフェーズ。

---

## Phase 4.5 — 編集（テキスト入力）の統合

最も慎重を要するサブフェーズ。`contentEditable`をJSXでどう扱うかを決める。

- `ItemNodeView`のテキスト要素に`contentEditable`propを直接束縛するのではなく、item.jsの`startEditing()`/`stopEditing()`と同じ「編集開始時だけDOM要素の`contentEditable`属性を命令的に切り替える」パターンを踏襲する（Solidの宣言的バインディングと`contentEditable`+カーソル位置維持は相性が悪いことが広く知られているため、ここは無理にリアクティブ化しない）。
- `domRefs`（Phase 4.1）経由でテキスト要素への参照を取得し、`startEditing()`/`stopEditing()`相当の処理を新エンジン用に実装する。IME対応・paste時のURL単体判定（`isUrlOnly`）・Tabキー抑制もそのまま移植する。
- 確定時のitemStoreへの書き戻し（`item.text = ...`）は、まだ`history.js`/`action.js`とは接続しない。単発の「編集して確定するとitemStoreのtextが変わる」ところまでに留める（undoはPhase 4.6）。
- 回帰確認: 深い階層でのテキスト編集後、`layoutResult`memoが変更経路だけ再計算されること（Phase 3.5で作った計測パターンを流用）。

リスク: 高。IME・フォーカス・contentEditableの組み合わせは環境依存のバグが出やすい。1コミットに収めず、「編集開始/終了のDOM切り替え」と「確定時のsignal書き戻し」を分けて小さくコミットする。

---

## Phase 4.6 — action.js/history.jsの新エンジン接続

`InsertNewItem`/`RemoveItem`/`MoveItem`/`SetText`/`SetValue`/`SetStatus`/`SetColor`/`SetTextColor`/`SetIcon`/`SetUrl`/`SetSide`/`SetLayout`/`SetShape`/`Multi`を、`Item`ではなく`ItemNode`に対して動作するように変更する。

- `action.js`自体は`item.text = x`のような公開プロパティ経由でしか状態を触っていない（Phase 6/7の設計メモにある通り）ため、`ItemNode`が同名のgetter/setterを既に持っていれば**ロジック自体は無変更で動く可能性が高い**。まず`action.item.test.js`相当のテストを`ItemNode`に対して実行し、素通りするかを確認するところから始める。
- `pickBalancedSide`/`pickInheritedShape`（doc08 Phase1のprogress noteで「意図的に複製していない」と明記されているヘルパー）をこのタイミングで実際に`ItemNode`に対して呼び出し、動作確認する。
- `history.js`はitem非依存（プレーンなスタック）なので変更不要。Undo/Redoコマンドの`isValid`判定もそのまま使えるはず。
- Phase 4.5の編集確定と接続し、「テキスト編集→Finish相当→SetTextアクション→Undo/Redoで戻る」の一連が新エンジンで動くことを確認する。

リスク: 中。ロジックの新規実装ではなく「既存ロジックが新データ型でも動くことの確認」が中心なので、Phase 4.5より低リスクに収まる見込み。

---

## Phase 4.7 — ドラッグ&ドロップの移植（domRefs経由）

`mouse.js`の`computeDragState()`/`finishDragDrop()`/`getStableDropCollision()`（doc07の軸マージン方式含む）を、`item.dom.content.getBoundingClientRect()`の代わりに`domRefs.get(item.id).getBoundingClientRect()`を読むように書き換える。

- ドラッグ判定のアルゴリズム自体（append/sibling判定、ヒステリシス）は一切変更しない。取得元だけを差し替える。
- ドラッグゴースト（`buildGhost`）は生DOM操作なので、新エンジンでも同じ命令的コードをそのまま使ってよい（Solidコンポーネント化する必要はない、CLAUDE.mdの「シンプルさ優先」に合致）。
- `mouse.test.js`の該当シナリオ（`elementFromPoint`優先探索、sticky collision、post-dragクリック抑制）を、`domRefs`ベースの新実装向けに移植する。

リスク: 中〜高。ユーザー操作の中でも複雑な部類（座標計算・状態機械）。`docs/07-drop-target-detection-refactor.md`のチェックリストをそのまま再利用して回帰確認する。

---

## Phase 4.8 — クリップボード（copy/cut/paste）の移植

`clipboard.js`を新エンジンの`action.js`（Phase 4.6で対応済み）に対して動くように移す。

- `document`のcaptureフェーズでのリッスン、`isCanvasActive()`/`ui.isActive()`/`editing`ガードはそのまま踏襲する（d01ドキュメントの教訓通り、リッスン場所を変える理由がない）。
- ペースト時の`plaintext`フォーマット変換（`format/plaintext.js`）は`ItemNode`のtoJSON/fromJSONと組み合わせて動くはずなので、ロジック自体は無変更で試す。
- `clipboard.test.js`のシナリオを移植する。

リスク: 中。Phase 4.6が先に完了していれば、ここは主に「配線」であり計算ロジックの新規実装はない。

---

## Phase 4.9 — currentItem/selection状態の一本化

ここでようやく元々のPhase 4の目標（`my-mind.js`のプレーンフィールドと`store.js`のミラーという二重管理の解消）に着手する。

- Phase 4.2〜4.8を通して新エンジン側に育った選択状態モジュールを正式な単一ソースとし、`store.js`の`currentItem`をこのモジュールへのre-exportに置き換える。
- ただし**この時点でもまだ旧エンジンは残っている**（`item.js`ベースのcanvasが`?newEngine`なしのデフォルト経路）。したがって、旧エンジン用の`my-mind.js`の`currentItem`プレーンフィールドまでは今回触らない。新エンジン内部の二重管理（Phase 4.2で作った専用モジュール vs 万一残っている旧`store.js`シグナルの重複読み書き）だけを解消する、というスコープに絞る。
- 旧エンジンと新エンジンをまたぐ本当の一本化は、Phase 6（旧エンジン削除）で新エンジンがデフォルトになったときに自然に完了する。

リスク: 低〜中。新エンジン内部の整理であり、旧エンジンの本番経路には影響しない。

---

## Phase 4.10 — 大量ノードでの回帰・再計測

Phase 4.5〜4.8で実データ変更経路が増えたことで、`layoutResult`のローカリティが壊れていないかを再確認する。

- `layout-measurement.test.js`/`itemStore-layout-locality.test.js`と同型の計測を、実際のドラッグ&ドロップ・編集・undo/redo操作を経由するシナリオに拡張する（doc08 Phase0の基準値と比較）。
- 50〜100ノード規模で手動確認（doc08 Phase0のチェックリストを流用）。
- ここで局所性が明確に悪化していれば、Phase 4.7以前のどこかに戻って設計を見直す（doc08本体の中断条件に従う）。

リスク: なし（計測のみ）。ここがPhase 4の完了ゲート。

---

## サブフェーズ一覧

| Phase | 内容 | リスク | 依存 |
|---|---|---|---|
| 4.0 | 影響範囲の棚卸し | なし | — |
| 4.1 | `domRefs`レジストリ導入 | 低 | 4.0 |
| 4.2 | 選択状態をitemStore側へ（表示のみ） | 低 | 4.1不要・並行可 |
| 4.3 | クリック選択の実配線 | 中 | 4.2 |
| 4.4 | キーボード（非破壊コマンドのみ） | 中 | 4.2 |
| 4.5 | テキスト編集の統合 | 高 | 4.1, 4.3 |
| 4.6 | action.js/history.jsの新エンジン接続 | 中 | 4.5 |
| 4.7 | ドラッグ&ドロップ（domRefs経由） | 中〜高 | 4.1, 4.6 |
| 4.8 | クリップボード移植 | 中 | 4.6 |
| 4.9 | currentItem/selection状態の一本化（新エンジン内） | 低〜中 | 4.3–4.8 |
| 4.10 | 大量ノード回帰・再計測 | なし | 4.9 |

各サブフェーズは1コミット/PRとして独立させ、前段の動作確認が終わってから次に進む（doc01以来の運用方針を踏襲）。特に4.5（編集統合）と4.7（DnD）は単独でも高リスクなので、さらに小さく割って進めてよい。

---

## Phase 5（改訂）— bridge patternの解体

元のPhase 5の内容はそのまま有効だが、依存関係をPhase 4の新サブフェーズに合わせて明記し直す。

- **`ui/notes.js`↔`NotesEditor.jsx`**: 変更なし。EasyMDEはSolid外のライブラリであり続けるため、このブリッジ自体は残す方針を維持（元のPhase 5と同じ判断）。
- **`title.js`↔`store.js`**: 変更なし（`document.title`同期はvanilla moduleのまま）。
- **`ui/context-menu.js`**: 既に解体済み（doc01で完了）。ただしPhase 4.9で選択状態モジュールが変わった場合、`ContextMenuContent`（`ContextMenu.jsx`）が読んでいる`commandRepo.get(id).isValid`の参照先が新旧どちらのcurrentItemを見るかは要確認。
- **`item.js`の`dom.link`クリックハンドラ**: Phase 4.5〜4.8で新エンジンの編集・アクション経路が揃った後、対応する新コンポーネント側の`onClick` propに素直に置き換わる。これは独立したブリッジではなく単純化なので、Phase 4.9完了後に小さく1回で片付けられる。
- Phase 5着手の前提は「Phase 4.10の計測ゲートを通過していること」。Phase 4が中断条件に該当した場合、Phase 5は着手しない。

Phase 6（旧エンジン削除）は従来通り、Phase 5完了後・feature flagなしで新エンジンのみが動作することを確認してからの純粋な削除作業として維持する。


---


# docs/08-phase4.0-dependency-inventory.md（草案）

## 目的

`docs/08-phase3-mindmap-engine-refactor.md`のPhase 3完了を受けて、Phase 4着手前に「旧エンジン（`item.js`/`my-mind.js`/`map.js`）にどこまで密結合したコードがあるか」をコード変更なしで棚卸しする。対象は`mouse.js`/`keyboard.js`/`clipboard.js`/`command/command.js`/`command/edit.js`/`command/select.js`/`action.js`の7ファイル。

以下、各モジュールについて「何に依存しているか」を種別ごとに分類する。分類は4種類:

- **App状態**: `my-mind.js`の`app.currentItem`/`app.selectedItems`/`app.editing`/`app.currentMap`など
- **Item DOM**: `item.dom.*`への直接アクセス（`getBoundingClientRect`等のDOM API呼び出し含む）
- **Item API**: `item.js`固有のメソッド（`startEditing()`/`handleEvent()`等）
- **他モジュール**: `action.js`/`history.js`/`command/command.js`など、Phase 4で一緒に移行が必要な周辺モジュール

---

## 1. `mouse.js`

| 種別 | 依存箇所 |
|---|---|
| App状態 | `app.currentMap`（`getItemFor`/`getClosestItem`/`adjustZoom`/`moveBy`/`ensureItemVisibility`）、`app.currentItem`、`app.editing`、`app.selectedItems`（`Set`）、`app.addToSelection()`、`app.selectItem()`、`app.action()`、`app.getAllSelected()` |
| Item DOM | `item.dom.content.getBoundingClientRect()`（`getContentRect()`、ドラッグ判定の中心）、`item.dom.content.cloneNode(true)`（`buildGhost()`）、`item.dom.content.classList`、`item.dom.content.style.boxShadow`（`visualizeDragState()`） |
| Item プロパティ（DOM非依存） | `item.parent`、`item.isRoot`、`item.side`、`item.contentSize`、`item.resolvedLayout.getChildDirection()` |
| 他モジュール | `command/command.js`（`commandRepo.get("edit"/"finish").execute()`）、`action.js`（`MoveItem`/`Multi`）、`scope.js`（`isCanvasActive()`）、`store.js`（`setHoveredItem()`） |
| ブラウザAPI | `document.elementFromPoint()`（`getItemUnderPointer()`） |

**Phase 4.7で間接化が必須な箇所**: `getContentRect()`（`item.dom.content.getBoundingClientRect()`を直接呼ぶ唯一の場所）、`buildGhost()`（`item.dom.content.cloneNode()`）、`visualizeDragState()`（`item.dom.content.style`書き込み）。doc07の軸マージン方式のロジック自体（`computeDragState()`の判定式）はitem.dom非依存の純粋な算術なので変更不要——**取得元だけ**を`domRefs.get(item.id)`に差し替えれば済む。

---

## 2. `keyboard.js`

| 種別 | 依存箇所 |
|---|---|
| App状態 | なし（`app`を直接importしていない） |
| Item DOM | なし |
| 他モジュール | `ui/ui.js`（`ui.isActive()`）、`command/command.js`（`commandRepo`の全走査、各コマンドの`.keys`/`.isValid`/`.execute()`）、`scope.js`（`isCanvasActive()`） |
| ブラウザAPI | `containerEl`への`keydown`/`focusout`リスナー、`document`への`focusin`リスナー、`document.activeElement`、`requestAnimationFrame`/`cancelAnimationFrame` |

**Phase 4.4で移植必須の仕組み**: フォーカス自己修復ガード（`handleFocusOut`/`handleFocusIn`/`pendingRestore`）。これは「タイトル編集不可バグ」対策としてCLAUDE.mdに記録されている既存の修正であり、`item.js`固有の依存を一切持たない（`containerEl`と`document`だけで完結）ため、**ロジックを一切変えずにそのまま移植可能**。IME合成中判定（`e.isComposing`）も同様。

`command/select.js`のコマンド（`Select`/`SelectAdd`/`SelectRoot`/`SelectParent`）が読む`app.currentItem.resolvedLayout`/`app.selectionCursor`/`item.parent`は、keyboard.js自体の依存ではなく`command/select.js`側の依存（下記4参照）。

---

## 3. `clipboard.js`

| 種別 | 依存箇所 |
|---|---|
| App状態 | `app.editing`、`app.currentItem`、`app.getAllSelected()`、`app.action()` |
| Item DOM | `item.dom.node.classList`（`onCopyCut()`の`cut`時、`.cut`クラス付与/除去のみ。`endCut()`でも同様） |
| Item API | `item.clone()`、`item.toJSON()` |
| Item プロパティ | `item.parent`、`i.isRoot` |
| 他モジュール | `map.js`（`Map.fromJSON`）、`ui/ui.js`（`ui.isActive()`）、`action.js`（`MoveItem`/`AppendItem`/`Multi`）、`format/format.js`（`formatRepo.get("plaintext")`）、`scope.js`（`isCanvasActive()`） |
| ブラウザAPI | `document`への`cut`/`copy`/`paste`のcaptureフェーズリスナー、`e.clipboardData` |

**Phase 4.8で必ず踏襲すべき知見（`docs/d01-clipboard-event-targeting.md`）**: `cut`/`copy`/`paste`は`keydown`と異なりフォーカスではなくSelectionの位置でtargetが決まるため、`containerEl`ではなく`document`のcaptureフェーズでリッスンする設計を**変更しない**。新エンジンでコンテナ構造が変わっても、この理由（Selectionベースのtarget解決）自体はDOM/ブラウザ仕様なので当てはまり続ける。

Item DOM依存は`.cut`クラスの付け外しのみと軽微——`domRefs`経由に置き換えれば済み、Phase 4.7のドラッグゴースト操作と同種の扱いでよい。

---

## 4. `command/command.js`

依存が最も広いモジュール。コマンドごとに整理する。

| 種別 | 依存箇所 |
|---|---|
| App状態 | `app.currentItem`、`app.getAllSelected()`、`app.action()`、`app.showMap()`、`app.setThrobber()` |
| Item プロパティ | `item.isRoot`、`item.children`、`item.collapsed`（`Pan`/`Fold`コマンド経由で`app.currentItem`から） |
| 他モジュール | `history.js`（`historyVersion`/`back()`/`forward()`/`canBack()`/`canForward()`）、`ui/notes.js`（`toggle()`/`canUndo()`/`canRedo()`/`undo()`/`redo()`）、`ui/ui.js`（`toggle()`）、`ui/io.js`（`quickSave()`/`show()`/`saveWithSvg()`/`resetCurrentMap()`）、`ui/toast.jsx`（`showToast()`）、`backend/image.js`（`ImageBackend`）、`action.js`（`InsertNewItem`/`RemoveItem`/`Multi`/`Swap`/`SetSide`）、`map.js`（`MindMap`）、`scope.js`（`isCanvasActive()`） |
| store.js signals | `setLeftPanelHidden`、`editing`（signal）、`currentItem`（signal）、`activeMode`、`notesHistoryVersion` |
| ブラウザAPI | `Pan`コマンドの`keyboardScope.addEventListener("keyup", this)`（`setKeyboardScope()`経由） |

**注意点**: `Command.isValid`のデフォルト実装が`store.js`の`editing`シグナル（`app.editing`のミラー）を読んでいる。Phase 4.9で選択状態を一本化する際、この`isValid`判定がどちらのシグナルを見るかが`ContextMenu.jsx`の`disabled`表示に直結するため、Phase 4.9のリスク欄に記載した確認事項はここに対応する。

`Undo`/`Redo`コマンドは`activeMode() === "notes"`で`notes.js`側の履歴に切り替える分岐を持つ——これはitem.js非依存なので新エンジンでもそのまま使える。

`Pan`コマンドの`step()`が`isCanvasActive()`を`execute()`ではなく`step()`内でガードしている理由（WASD押しっぱなし中にモード切替されるケース）は、`pan-keyboard-scope.test.js`で明示的にテストされている——**移植時にこのガード位置を保つこと**を要注意点として記録。

---

## 5. `command/edit.js`

| 種別 | 依存箇所 |
|---|---|
| App状態 | `app.startEditing()`、`app.stopEditing()`、`app.currentItem`、`app.action()`、`app.getAllSelected()`、`app.clearMultiSelection()` |
| Item API | `item.isNew`、`startEditing()`/`stopEditing()`は`app.*`経由で間接的に`item.js`の同名メソッドを呼ぶ |
| Item DOM | `item.dom.text`（`Style`クラスの`execCommand`、`Newline`コマンドの`getSelection().getRangeAt(0)`とDOM Range操作） |
| Item プロパティ | `item.text`、`item.value`、`item.isRoot`、`item.status` |
| 他モジュール | `action.js`（`InsertNewItem`/`SetText`/`Multi`）、`history.js`（`push()`、`InsertNewItem`のdo()を再実行せずhistoryだけ積む特殊ケース）、`ui/notes.js`（`close()`）、`mouse.js`（`isDragging()`/`cancelDrag()`）、`store.js`（`closeHelp`/`openValueDialog`） |
| ブラウザAPI | `document.execCommand()`、`getSelection()` |

**Phase 4.5で最重要**: `Style`（Bold/Italic/Underline/Strikethrough）は`document.execCommand`ベースで、`item.dom.text`への直接依存が最も濃い箇所。新エンジンで`contentEditable`をどう扱うか（プランでは「命令的にDOM切り替え、Solidで宣言的にバインドしない」方針）が固まるまでこのコマンド群は着手できない——Phase 4.5の後続として扱う。

`Finish`コマンドの`item.isNew`分岐（ドラフトノードの扱い、undo履歴を汚さない設計）はロジックとして重要で、`action.item.test.js`にテストがある——Phase 4.6で`ItemNode`に対して同じテストを流用して検証する対象。

---

## 6. `command/select.js`

| 種別 | 依存箇所 |
|---|---|
| App状態 | `app.currentItem`、`app.selectItem()`、`app.selectionCursor`、`app.extendSelection()` |
| Item プロパティ | `item.resolvedLayout.pick()`（`Select`/`SelectAdd`）、`item.isRoot`/`item.parent`（`SelectRoot`/`SelectParent`） |
| 他モジュール | `command/command.js`（`Command`基底クラス、`isMac()`） |

このファイルはitem.dom依存が皆無で、`resolvedLayout`（`ItemNode`が既に持つ）だけに依存している。Phase 4.4で最初のターゲットに選んだ理由（4.4節参照）はこの棚卸しで裏付けられる——**破壊的操作なし・DOM依存なし・`resolvedLayout`は移植済み**という3条件が揃う唯一のコマンド群。

---

## 7. `action.js`

| 種別 | 依存箇所 |
|---|---|
| App状態 | `app.selectItem()`（全アクションの`do()`/`undo()`末尾） |
| Item クラス直接依存 | `import Item from "./item.js"`、`InsertNewItem`のデフォルト分岐で`new Item()` |
| Item プロパティ（setter経由） | `item.text`/`item.value`/`item.status`/`item.icon`/`item.url`/`item.side`/`item.color`/`item.textColor`/`item.layout`/`item.shape` |
| Item ツリー操作 | `parent.insertChild()`/`parent.removeChild()`、`item.parent`/`item.children`/`item.isRoot` |

**唯一`Item`クラスを直接importしている箇所**（`new Item()`）。`ItemNode`に切り替える際は、この1箇所（`InsertNewItem`のコンストラクタ、`item`引数省略時のデフォルト生成）だけをimport差し替えで対応できる見込み——doc08 Phase 6のprogress noteで既に「`action.js`自体は公開プロパティ経由でしか状態を触っていない」と分析済みで、この棚卸しもそれを裏付ける。

`pickBalancedSide()`/`pickInheritedShape()`はモジュール内のプレーンなヘルパー関数で、`item.side`/`item.shape`/`item.children`/`item.isRoot`しか読まない——Phase 1のprogress noteが「複製しなかった」と明記した通り、`ItemNode`に対してそのまま呼べる。

---

## 8. 横断的な注意点まとめ

| 知見の出典 | 内容 | 対応するPhase 4サブフェーズ |
|---|---|---|
| CLAUDE.md（タイトル編集不可バグ） | keyboard.jsのフォーカス自己修復ガード（rAF、`focusin`優先） | 4.4 |
| `docs/d01-clipboard-event-targeting.md` | clipboard.jsは`document`のcaptureフェーズでcut/copy/pasteをリッスン（Selectionベースのtarget解決のため） | 4.8 |
| `docs/06.1-recursive-memo-layout-refactor.md` | `foreignObject`ペイントタイミング問題（rAF二重待ち、collapsed→expand時） | 4.5（テキスト編集でのサイズ変化）/4.7（ドラッグ挿入） |
| `docs/07-drop-target-detection-refactor.md` | ドラッグの軸マージン方式（append/sibling判定） | 4.7（アルゴリズム不変、取得元のみ`domRefs`化） |
| `docs/01-mindmap-state-refactor.md`（Phase 6/7メモ） | `action.js`は常に公開プロパティ経由でのみ状態を触る | 4.6（この性質のおかげで低リスク） |
| `frontend/.../command.js`の`Pan` | `isCanvasActive()`ガードは`execute()`ではなく`step()`内（WASD押しっぱなし対策、`pan-keyboard-scope.test.js`で保証） | 4.4 |

---

## 9. Phase 4.1以降への申し送り

- `domRefs`（Phase 4.1）が実際に必要になるのは、**mouse.js（4.7: ドラッグ判定・ゴースト）とclipboard.js（4.8: `.cut`クラス付け外し）の2箇所のみ**。テキスト編集（4.5）はitem.dom.textへの直接依存なので、Phase 4.5では`domRefs`を経由しつつも「命令的DOM切り替え」パターンを維持する（`domRefs.get(item.id)`から取得した要素に対して`contentEditable`を直接いじる形になり、Solid側の宣言的バインディングは使わない）。
- `action.js`の`new Item()`が唯一の直接依存であることが確認できたため、Phase 4.6の見積もり（「ロジック自体は無変更で動く可能性が高い」）はこの棚卸しで裏付けられた。着手時はまず`action.item.test.js`相当を`ItemNode`に対してそのまま実行し、赤くなる箇所だけを直す方式で進めてよい。
- `command/command.js`は依存範囲が広いため、Phase 4.4（`select.js`）→4.6（`action.js`接続後の非破壊コマンド）→4.5後（`edit.js`のStyle系）という順で段階的に`command/command.js`自体の対応範囲を広げていく形になる。一括で`command/command.js`全体を新エンジン対応させるサブフェーズは意図的に設けていない。

---