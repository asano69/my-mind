# 再帰的memoチェーンによる大量ノード向けレイアウト改善計画

## 背景

大量ノードを持つマインドマップでは、1つのノードを編集しただけでも`map.js`のルート`createComputed`がツリー全体のsignalを読み直し、全ノードのDOM更新・計測・レイアウト書き込みを再実行してしまう。`docs/05-layout-subtree-scoping-refactor.md`ではdirtyフラグ方式を検討したが、`docs/05.1-layout-subtree-scoping-refactor.md`で整理された通り、より自然な解決策は「アイテムごとの独立effect」ではなく、親が子のmemoを同期的に読む**再帰的memoチェーン**である。

この計画では、Solidのpull-basedな`createMemo`を使い、変更されたノードからルートまでの依存経路だけを再計算対象にする。手動dirtyフラグや継承プロパティ専用の`markSubtreeDirty()`は追加しない。

## 目的

- 葉ノードのテキスト編集、status/value/icon/notes変更、collapse切り替えなどで、無関係な兄弟サブツリーの再計測を避ける。
- 既存のpost-orderレイアウト順序を、SolidのeffectスケジューラではなくJavaScriptの関数呼び出し順で保証する。
- レイアウト責務を`Item`自身へ寄せ、`map.js`の全体再帰関数を段階的に薄くする。
- 実装中も各フェーズを小さく保ち、計測結果で効果を確認しながら進める。

## Non-goals

- `layout/*.js`の幾何計算アルゴリズムそのものは変更しない。
- 複数の独立した`createEffect`/`createComputed`をアイテムごとに作り、実行順序をSolidのスケジューラに任せる設計は採用しない。
- `getBBox()`、`offsetWidth`、`scrollWidth`などDOM計測自体のコストを消すことは目的にしない。今回減らすのは「無関係な枝まで計測する回数」である。
- フォントサイズ変更のように全ノードの実測サイズへ影響する操作まで部分更新化しない。

## 採用設計

各`Item`が自分のサブツリーのレイアウト結果を返す非公開memoを持つ。

```js
this._layoutResult = createMemo(() => this._computeLayout());
```

`_computeLayout()`は、現在`map.js`側にある`updateContent`、`measureAndSizeContent`、`writeLayout`相当の処理を1アイテム単位で実行する。子のサイズが必要な箇所では、親が子の`_layoutResult()`を直接呼ぶ。子memoがstaleならその場で同期的に再計算されてから値が返るため、親は常に確定済みの子サイズを読める。

Map側はルートだけを読む。

```js
createComputed(() => {
  const rootSize = this._root._layoutResult();
  this.node.setAttribute("width", String(rootSize[0]));
  this.node.setAttribute("height", String(rootSize[1]));
  bumpDirty();
});
```

これにより、通常のノード更新では「更新されたノード自身のmemo」と「それを読む祖先memo」だけが再計算される。兄弟ブランチは依存経路に含まれないため、Solidのメモ化でスキップされる。

## フェーズ計画

### Phase 0 — 計測基盤と現状特性化

本番挙動を変えず、現在の全体再計算コストを数値化する。

- `layoutSubtree`、`updateContent`、`measureAndSizeContent`、`writeLayout`の訪問数を開発時だけ記録できる小さな計測フックを追加する。
- 以下のシナリオで、1レイアウトパスあたりの訪問ノード数と実行時間を記録する。
  - 50〜100ノード程度の深い木で、葉ノードのテキストを編集する。
  - 同じ木で、葉ノードのstatus/value/icon/notesを変更する。
  - 中間ノードのcollapsedを切り替える。
  - ルートのlayout/shape/color/textColorを変更する。
  - フォントサイズズームを実行する。
- Phase 0の計測値を、このリファクタリングの採否判断の基準にする。Phase 3以降で改善が確認できなければ中断または差し戻しを検討する。
- 計測フックは本番コードに恒久的に残さない。残す場合はテスト専用、または明示的な開発フラグ配下に限定する。

リスク: 低。挙動変更を伴わないが、計測コードを本番パスへ残さないよう注意する。

### Phase 1 — `Item`単位の小さなレイアウトメソッドを切り出す

memo化の前に、既存処理を移動しやすい形へ分割する。

- `map.js`の`updateContent(item)`相当を、`Item`の`_updateLayoutContent()`へ移す。
- `measureAndSizeContent(item)`相当を、`Item`の`_measureOwnContent()`へ移す。
- `writeLayout(item)`相当のうち、1アイテムの見た目更新とレイアウト委譲を`Item`の`_writeOwnLayout()`へ寄せる。
- この段階では、既存の`layoutSubtree`から新しいメソッドを呼ぶだけにし、再計算範囲はまだ全ツリーのままにする。
- 既存テストに加え、メソッド切り出し後もノードのテキスト、アイコン、status/value、notes、shape、connectorが従来通り更新されることを確認する。

リスク: 中。処理移動による回帰が主なリスクなので、memo化より前に純粋なリファクタリングとして分ける。

### Phase 2 — `Item._layoutResult` memoを導入するが、Map側の全体再帰は残す

新しい依存グラフを作り始めるが、切り替えはまだ行わない。

- `Item`の既存`createRoot`ブロック内に`this._layoutResult = createMemo(() => this._computeLayout())`を追加する。
- `_computeLayout()`ではPhase 1で切り出した3つの小メソッドを順に呼ぶ。
- collapsedでない場合だけ、`this._childrenVersion()`を読んだ上で子の`_layoutResult()`を呼ぶ。
- `_computeLayout()`は最後に`this.size`を返す。
- この時点ではMapの`createComputed`は従来の`layoutSubtree(this._root)`を使い続ける。新memoはテストから明示的に呼び、依存関係と戻り値の正しさを確認する。
- テストでは、子のtext変更時に子memoと祖先memoが再評価され、無関係な兄弟memoは再評価されないことを計測用スパイで確認する。

リスク: 中。memo内部でDOM書き込みを行うため、外部公開しない命名と配置を徹底する。

### Phase 3 — Mapのレイアウト起点をルートmemoへ切り替える

実際に全体再帰を廃止し、再帰的memoチェーンを正式なレイアウト経路にする。

- `map.js`のルート`createComputed`を、`layoutSubtree(this._root)`ではなく`this._root._layoutResult()`を読む形に変更する。
- ルートmemoの戻り値を使ってSVGの`width`/`height`を更新する。
- 旧`layoutSubtree`、`updateContent`、`measureAndSizeContent`、`writeLayout`はMap側から参照されなくなった時点で削除する。
- 既存の`requestLayout()`は、非signal由来の再計算トリガー用に一旦残す。
- Phase 0と同じシナリオを再計測し、葉ノード編集や局所的なstatus/value変更で訪問数がツリー全体ではなく変更経路中心に縮小していることを確認する。

リスク: 高。このフェーズが挙動切り替え点なので、手動確認と回帰テストを厚くする。

### Phase 4 — 非signal由来トリガーを局所化する

`docs/05.1-layout-subtree-scoping-refactor.md`で挙げられた3つの特殊ケースを、全体再計算から必要範囲の再計算へ縮小する。

- `item.side`変更用に、各`Item`へ`_sideVersion`と`_bumpSideVersion()`を追加する。`_computeLayout()`で`_sideVersion()`を読む。
- `SetSide.do()`/`undo()`や`mergeWith`など、sideを書き換える箇所では対象itemの`_bumpSideVersion()`を呼ぶ。
- contentEditableのライブ`input`では、対象item専用の`_contentVersion`または既存signal更新へ寄せ、対象itemと祖先だけを再計算させる。
- フォントサイズズームは全ノードの実測サイズに影響するため、Map単位の`fontSizeVersion`を用意し、全itemの`_computeLayout()`で読む。`adjustFontSize()`ではこのversionをbumpする。
- `requestLayout()`の用途を棚卸しし、局所versionで置き換えられる呼び出しと、全体versionが必要な呼び出しを分離する。

リスク: 中。呼び忘れがあると特定操作だけ更新漏れになるため、各トリガーごとに回帰テストを追加する。

### Phase 5 — 継承memoとの相互作用を確認する

下方向の継承memoと上方向のレイアウトmemoが干渉しないことを確認する。

- `resolvedColor`、`resolvedTextColor`、`resolvedShape`、`resolvedLayout`を読む箇所が`_computeLayout()`内に収まっていることを確認する。
- ルートのcolor/textColor/shape/layout変更で、明示上書きしていない子孫だけが正しく再描画されることをテストする。
- 子孫側で明示上書きしている場合、祖先変更の影響を受けないことをテストする。
- dirtyフラグ方式で必要だった`markSubtreeDirty()`相当の特別扱いを追加していないことを確認する。

リスク: 中。見た目の継承はユーザーに分かりやすい不具合として出るため、UI確認も行う。

### Phase 6 — 後片付けと公開境界の整理

内部APIが漏れないようにし、長期保守しやすい形へ整える。

- `_layoutResult`、`_computeLayout()`、各version bump関数がUIコンポーネントや外部モジュールから直接使われていないことを確認する。
- 必要なら`Symbol`または専用モジュール内の非export関数で、レイアウト内部APIを隠す。
- Phase 0の一時計測コードを削除する。
- 大量ノードの手動確認手順と期待値をドキュメントに残す。
- `docs/05-layout-subtree-scoping-refactor.md`のdirtyフラグ案は歴史的検討として残し、このドキュメントを実装方針として参照する。

リスク: 低。主に整理フェーズであり、挙動変更は避ける。

## フェーズ一覧

| Phase | 内容 | 主な成果物 | リスク |
|---|---|---|---|
| 0 | 計測基盤と現状特性化 | before指標、計測シナリオ | 低 |
| 1 | `Item`単位メソッド切り出し | `_updateLayoutContent()`など | 中 |
| 2 | `_layoutResult` memo導入 | `_computeLayout()`、memo単体テスト | 中 |
| 3 | Map起点をルートmemoへ切替 | 旧全体再帰の削除、after指標 | 高 |
| 4 | 非signalトリガー局所化 | side/input/fontSize version | 中 |
| 5 | 継承memoの検証 | 継承プロパティ回帰テスト | 中 |
| 6 | 後片付け | 内部API整理、計測コード削除 | 低 |

## 実装時チェックリスト

- 葉ノード編集で、無関係な兄弟サブツリーのDOM計測が走らない。
- 子の追加・削除で、親の`_childrenVersion()`経由の依存が正しく更新される。
- collapsedなノードの子孫memoが不要に読まれない。
- side変更で左右レイアウトが更新される。
- contentEditable入力中にノードサイズと祖先レイアウトが追従する。
- フォントサイズズームでは全ノードが再計測される。
- color/textColor/shape/layoutの継承が従来通り反映される。
- undo/redo、ドラッグ&ドロップ、merge操作で更新漏れがない。
- memo内部のDOM書き込みを外部コードから偶発的に起動しない。

## 中断条件

- Phase 3後の計測で、葉ノード編集や局所更新の訪問数がPhase 0比で明確に減らない。
- memo内部副作用により、更新順序やテスト安定性がdirtyフラグ方式より悪化する。
- `_layoutResult()`の外部利用を防げず、保守上のリスクが高いと判断される。

これらに該当する場合は、Phase 3を差し戻し、`docs/05-layout-subtree-scoping-refactor.md`のdirtyフラグ方式へ戻るか、計測で特定された別のボトルネックを優先する。
