# doc08 phase6 — 旧エンジン完全削除

ポイントは「まだ移植されていない旧エンジン固有ロジックを新エンジン側に吸収し、そのあとで旧ファイルを消す」という順序を厳守すること。

## 前提・非目標

- new*プレフィックスは維持する（リネームしない）。
- レイアウト計算のアルゴリズム自体（layout/*.js の pure functions）は変更しない。移植対象は「旧エンジンだけが握っている依存」の解消のみ。
- 各フェーズは1コミット/PRとして独立させ、ここのPhase6に入る前に「旧エンジンファイルへの外部依存がゼロ」であることをgrepで機械的に確認できる状態にする。
- もう、?oldEngine=1はつかわないので、旧エンジンが壊れないようにする配慮はいらない。
- 

---

## Phase 1 — `action.js` の分割（プロパティmutator/ヘルパーの吸収）

**問題**: `newAction.js` は `action.js` の `Multi`/`Set*`/`pickBalancedSide`/`pickInheritedShape`/基底`Action`をimportしているが、`action.js`自体は`Item`と`app`（my-mind.js）に依存しているため単純delete不可。

- `action.js`のうち、`Item`/`app`に依存しない部分（基底`Action`、`Multi`、`Set*`系mutator、`pickBalancedSide`、`pickInheritedShape`）を`newAction.js`に直接移す（コピーではなく移動）。
- ツリー操作系（`InsertNewItem`/`AppendItem`/`RemoveItem`/`MoveItem`/`Swap`、`Item`/`app`依存部分）は`newAction.js`に既に同等実装があるため、旧`action.js`側は丸ごと不要になる。
- `action.js`・`action.test.js`・`action.item.test.js`を削除。`action.item.test.js`が検証していた「signal-backed propertyへのdo/undo」観点は、`newAction.test.js`で`ItemNode`に対して同種のテストが既にあることを確認し、不足があれば追加する。

リスク: 低〜中（importの付け替えのみ、ロジック変更なし）。

---

## Phase 2 — `TOGGLE_SIZE` の切り出し

**問題**: `layout/tree.js`と`NewMindMapPreview.jsx`が`item.js`から`TOGGLE_SIZE`をimportしている。

- `TOGGLE_SIZE`（および関連する`D_MINUS`/`D_PLUS`生成ロジックがあれば）を`itemStore.js`か新規の小さな定数モジュール（例: `layout/constants.js`）に移す。
- `layout/tree.js`・`NewMindMapPreview.jsx`のimport元をそちらに切り替える。

リスク: 低。

---

## Phase 3 — `ui/io.js` / `backend/image.js` の旧エンジンフォールバック除去

**問題**: 両ファイルとも`my-mind.js`/`map.js`をimportし、`treeProvider`/`svgNodeProvider`/`restoreProvider`未設定時のフォールバックとして使っている。新エンジンは`NewMindMapPreview.jsx`のマウント時に必ず`newIo.attach()`するため、フォールバック経路は実質到達不能。

- `ui/io.js`: `getCurrentTree()`のフォールバック（`app.currentMap`）、`restore()`/`restoreSnapshot()`の`app.showMap(MindMap.fromJSON(...))`分岐を削除し、provider未設定時はエラーまたは何もしない扱いにする。
- `backend/image.js`: `serializeCurrentMap()`/`ImageBackend.download()`のデフォルト引数（`app.currentMap.node`等）を削除し、呼び出し側（`RightPanelExportActions.jsx`）が必ず明示的に渡す前提にする（既にそうなっている）。
- 両ファイルから`import * as app from "../my-mind.js"`・`import MindMap from "../map.js"`を削除。

リスク: 低〜中。provider未登録時の呼び出し経路がないことを既存の`io.js`関連テストで確認する。

---

## Phase 4 — UIコンポーネントの二重分岐を単一化

対象: `MindMapCanvas.jsx`、`ContextMenu.jsx`、`RightPanelProperties.jsx`、`ValueDialog.jsx`、`RightPanelExportActions.jsx`、`currentSelection.js`。

- `isNewEngineEnabled()`分岐のうち旧エンジン側（`else`節、`oldCurrentItem`、`command/command.js`+`my-mind.js`のdynamic import等）を削除し、新エンジンの経路だけを残す。
- `currentSelection.js`は`itemSelection.js`の直接re-exportに縮小するか、このファイル自体を廃止して呼び出し元（`ui/notes.js`など）を`itemSelection.js`に向け直す。
- `MindMapCanvas.jsx`の`newEngine`変数・`engine`/`mouseModule`（旧`mouse.js`用）を削除し、常時`NewMindMapPreview`をレンダリングする形に単純化。

リスク: 中。UIの表示分岐が変わるため、各ダイアログ・パネルの手動確認が必要（Phase 9の手動チェックリストに含める）。

---

## Phase 5 — `HelpPanel.jsx` / `TopBar.jsx` / `LeftPanel.jsx` の command 依存移行

**問題**: これら3つは`command/command.js`（+`command/edit.js`/`command/select.js`）を動的importしてコマンド一覧・Undo/Redo判定・ボタン実行に使っている。新エンジンの対応物は`newContextMenuCommands.js`（コマンドrepo）と`newKeyboard.js`/`history.js`（Undo/Redo）。

- `TopBar.jsx`: `runCommand()`を`newContextMenuCommands.js`の`repo.get(id).execute()`に切り替え。`canUndo`/`canRedo`は`history.js`の`historyVersion`+`history.canBack()/canForward()`を直接読む形にする（`newContextMenuCommands.js`の`undo`/`redo`エントリが既にこのロジックを持つので、そこを再利用するか、素直に`history.js`を直接見る）。
- `LeftPanel.jsx`: `runCommand()`を`newContextMenuCommands.js`に切り替え。
- `HelpPanel.jsx`: コマンド一覧の構築元を`newContextMenuCommands.js`の`repo`（+`newKeyboard.js`が持つ非破壊系コマンドの`keys`）に切り替える。旧`command/command.js`の`repo`は`label`/`keys`の形が違う可能性があるため、`newContextMenuCommands.js`側に`label`/`keys`が揃っているか確認し、足りなければ補う（例えば`select`系コマンドのラベルなど、ヘルプ表示に必要なものを`newKeyboard.js`側のcommands配列に`label`を足すなど）。

リスク: 中。ヘルプパネルの表示内容が変わりうるので、実際にヘルプパネルを開いて内容を確認する。

---

## Phase 6 — `shape/*.js` / `layout/*.js` のDOM書き込みメソッド削除

**対象**: `shape/box.js`/`shape/ellipse.js`/`shape/underline.js`の`update(item)`（`item.dom.content.style`書き込み）、`layout/graph.js`/`layout/tree.js`/`layout/map.js`の`update(item)`・`writeConnectorPaths()`・`writeRootConnectorPaths()`・`layout/layout.js`の`positionToggle()`。

- これらは`item.dom`を前提にしており、新エンジンは`computeBoxStyle()`/`computeEllipseStyle()`/`computeUnderlinePath()`/`computeGraphLayout()`/`computeTreeLayout()`/`computeMapLayout()`という純粋関数版だけを使っている（Phase 3.1〜3.7で確立済み）。
- 各クラスから`update(item)`メソッド、及びそれが呼ぶ`write*()`系メソッドを削除。`Shape`/`Layout`基底クラス側の`update()`のデフォルト実装（あれば）も削除。
- `svg.js`/`html.js`はこれらのwriteメソッドと`item.js`/`map.js`からしか参照されなくなるはずなので、Phase 7の削除対象に含める（grepで他に参照がないことを確認）。

リスク: 低。純粋関数側のロジックには一切触れないため、`pure-layout.test.js`/`pure-shape.test.js`は無影響のはず。

---

## Phase 7 — 依存ゼロの確認（削除前ゲート）

- `grep -rn 'from "\.\./item\.js"\|from "\./item\.js"\|from "\.\./my-mind\.js"\|from "\./my-mind\.js"\|from "\.\./map\.js"\|from "\./map\.js"\|command/command\.js\|command/edit\.js\|command/select\.js\|"\./mouse\.js"\|"\./keyboard\.js"\|"\./clipboard\.js"\|ui/ui\.js\|ui/context-menu\.js' frontend/src` を実行し、Phase 1〜6で移行したファイル以外に旧エンジンモジュールへの参照が残っていないことを確認する。
- 残っていればそれはPhase 1〜6で見落とした依存なので、削除前にここで潰す。

リスク: なし（確認のみ）。ここがPhase 8着手のゲート。

---

## Phase 8 — 旧エンジンファイルの削除

一括ではなく、依存の少ない順に小さく分けて削除する。

1. `command/select.js`・`command/edit.js`・`command/command.js`（Phase 5完了後、参照者なし）
2. `mouse.js`・`keyboard.js`・`clipboard.js`
3. `ui/ui.js`・`ui/context-menu.js`（死んでいることをPhase 7で確認済みなら）
4. `item.js`・`map.js`・`my-mind.js`（最後。互いに循環参照しているため一緒に削除）
5. `svg.js`・`html.js`（Phase 6完了後、参照者なしを確認してから）

対応するテストも同時に削除:
- `item.test.js`、`action.item.test.js`（Phase1で先行削除済みのはず）、`mouse.test.js`、`keyboard.test.js`、`clipboard.test.js`、`map.test.js`、`ui/ui.test.js`、`pan-keyboard-scope.test.js`
- `layout-measurement.test.js`（`newEngine-layout-measurement.test.js`に完全代替されているため削除。ベースライン数値はdocs内に既に記録済みなので情報損失なし）

各ステップの直後に `pnpm test` を通し、壊れていないことを確認してから次のファイルに進む。

リスク: 低（Phase 7のゲートを通過していれば、原理的にビルドが壊れないはず）。ただし念のため1ファイル/グループごとにテスト実行。

---

## Phase 9 — 手動確認（ユーザー承認済み）

`newEngine-large-tree-regression.test.js`末尾のチェックリストに加え、Phase 4/5で分岐を削除したUI（HelpPanel、TopBar、LeftPanel、RightPanelProperties、ValueDialog、RightPanelExportActions、ContextMenu）が旧分岐削除後も正しく動くか一通り触って確認する。

---

## Phase 10 — 後片付け・ドキュメント更新

- `newEngineFlag.js`（`isNewEngineEnabled`/`?oldEngine=1`）は、もう分岐先が存在しないため削除するか判断。エンジンが1つしかない以上フラグ自体に意味がなくなるので、削除を推奨（ただし急ぐ必要はなく、Phase 11相当として独立PRでよい）。
- `CLAUDE.md`のWork in progress節を更新し、pubsub時代のグローバル状態リファクタというテーマがdoc08〜doc09の完了をもって解消されたことを記録。doc08本文のPhase 6の記述もこのdoc09で実施した内容に合わせて更新。
- `README.md`の「Pub/Sub→Solid移行中」注記を、移行完了に合わせて更新または削除。
- 歴史的検討として残すドキュメント（doc05のdirtyフラグ案、doc06/06.1の再帰的memoチェーン案など）はそのまま残し、doc08/doc09が最終実装方針であることを明記する一文を追加。

リスク: なし。

---

## フェーズ一覧

| Phase | 内容 | リスク | 依存 |
|---|---|---|---|
| 1 | action.jsの分割・吸収 | 低〜中 | — |
| 2 | TOGGLE_SIZEの切り出し | 低 | — |
| 3 | ui/io.js・backend/image.jsの旧フォールバック除去 | 低〜中 | — |
| 4 | UIコンポーネントの二重分岐単一化 | 中 | — |
| 5 | HelpPanel/TopBar/LeftPanelのcommand依存移行 | 中 | — |
| 6 | shape/layoutのDOM書き込みメソッド削除 | 低 | — |
| 7 | 依存ゼロ確認（削除ゲート） | なし | 1–6 |
| 8 | 旧エンジンファイル削除（段階的） | 低 | 7 |
| 9 | 手動確認 | — | 8 |
| 10 | 後片付け・ドキュメント更新 | なし | 9 |

Phase 1〜6は依存関係がほぼ独立しているため、並行して進めても構いません（順不同で着手可）。ただしPhase 7のゲートは必ず全部完了後に通してから削除に入ってください。

---

What's left unhandled
- store.js's currentItem/setCurrentItem/editing/setEditing signals look dead now too (their only writer, my-mind.js, is gone, and their remaining readers were the branches just deleted), but I didn't touch them without being able to grep — worth a follow-up pass.
- Phase 9's manual click-through of HelpPanel/TopBar/LeftPanel/RightPanelProperties/ValueDialog/RightPanelExportActions/ContextMenu is still up to you.
- Phase 10 (deleting newEngineFlag.js is done above, but CLAUDE.md's Work-in-progress note and README.md's "Pub/Sub→Solid移行中" banner still reference the old architecture) — happy to update those next if you want.

