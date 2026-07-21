# レイアウト計算のサブツリー限定化リファクタリング計画

## 背景

`docs/04-mindmap-zoom-refactor.md` で扱った「読み取り→書き込みの往復によるレイアウトスラッシング」は解消済み（`layoutSubtree`を読み取りフェーズ・書き込みフェーズに分離するPhase 1対策）。

残っている根本原因は、`map.js`の`createComputed`が**木全体を1つの依存関係の塊として追跡している**ことである。`layoutSubtree(this._root)`の中で`updateText()`/`updateStatus()`/`updateValue()`/`updateIcon()`/`updateNotes()`などが各アイテムのsignalを読むため、Solidは「このcomputedはツリー中の全アイテムの全signalに依存している」と認識する。結果、どこか1箇所（例えば1つの葉ノードのテキスト編集）が変わっただけで、ツリー全体が毎回再測定・再描画される。これは`docs/01-mindmap-state-refactor.md`のPhase 8進捗メモで「既知のフォローアップ」として明記されている問題そのものである。

## Non-goals

- Solidのレンダリングシステム自体を変更しない。`item.js`のsignal/memo構成（Phase 6〜9で確立済み）はそのまま使う。
- ノードごとに独立した`createEffect`/`createComputed`を作る設計（後述「不採用案」）は採用しない。
- レイアウトアルゴリズム自体（`layout/*.js`の幾何計算）は変更しない。

## 設計方針（重要な判断）

### 不採用案: アイテムごとの独立effect

一見自然に見えるのは、「アイテムごとに`createComputed`を持たせて、そのアイテム自身のsignalにだけ依存させる」という設計である。しかし採用しない。理由:

- `layoutSubtree`の現在の3フェーズ（`updateContent`→`measureAndSizeContent`→`writeLayout`）は、**子が親より先に処理される**という順序保証（post-order）に強く依存している。親のサイズは子の実測サイズに依存し（Phase 2〜3）、子の位置は親のレイアウトアルゴリズムの出力に依存する（Phase 3）。
- Solidの複数の独立した`createComputed`は同一トランザクション内でまとめてバッチ実行されるが、**兄弟間・親子間の実行順序は保証されない**。順序に依存した現在のコードをそのまま複数effectに分割すると、「子が測定される前に親が読む」といった、Milkdownの`editableEl`と同種の「タイミング依存の再発しやすいバグ」を新規に持ち込むリスクが高い。
- CLAUDE.mdの「関数は小さく焦点を絞る」「保守のしやすさを最優先する」という方針とも相性が悪い。ここでSolidのfine-grained reactivityに頼るのは、賢いが読みにくい設計になりやすい。

### 採用案: 手動の「dirtyフラグ + 単一パス」方式

`createComputed`はそのまま**1つ**に保つが、その中身を「シグナルを読んで自動追跡させる」のではなく、「どのアイテムが変更されたかを明示的なフラグで管理し、その集合だけを訪問する」方式に変える。

- 各`Item`インスタンスに、Solid signalではない**プレーンな`dirty`フラグ**を持たせる（`this._dirty = true`程度の単純なプロパティ）。
- 各setter（`text`/`icon`/`value`/`status`/`notes`/`collapsed`/`color`/`textColor`/`shape`/`layout`/`insertChild`/`removeChild`）が、値を書き込むと同時に`markDirty(this)`を呼ぶ。`markDirty`はそのアイテム自身を`dirty=true`にし、`.parent`をたどって祖先も`dirty=true`にする（既にdirtyな祖先に到達したら打ち切ってよい）。
- `map.js`側は、この`markDirty`が呼ばれるたびに軽量なバージョンsignal（既存の`layoutVersion`）を1回bumpするだけにする。`createComputed`は`layoutVersion()`だけを読み、それ以外のsignal読み取りは全て`untrack()`で囲む。これによりSolidの自動依存追跡を「バージョン番号だけ」に限定し、木全体への暗黙の依存を切る。
- `layoutSubtree`の各フェーズは、`item.dirty`が false のノードに到達したら**再帰を打ち切り、何も読み書きしない**。ただし親から子への`position`（translate）書き込みは、レイアウトアルゴリズム上どうしても親のパスで発生するため、dirtyでない子にも書き込まれる（これは`offsetWidth`読み取りのような重い処理ではなく、単なる属性書き込みなので許容する）。

この方式のメリットは、既存の「子から先に処理する再帰」という構造そのものは一切変えず、**各再帰の入り口に「dirtyでなければ即return」を足すだけ**で済む点にある。シンプルさを優先するという方針とも合致する。

## 既知の制約（先に明記しておく）

- `resolvedColor`/`resolvedTextColor`/`resolvedShape`/`resolvedLayout`は親から子への**継承**メモである。親の`color`/`shape`/`layout`が変わると、明示的に上書きしていない子孫すべての見た目が変わりうる。したがって`color`/`textColor`/`shape`/`layout`の4つのsetterだけは、上方向だけでなく**配下すべてを再帰的にdirty化**する必要がある（`markSubtreeDirty`）。これは「祖先だけ辿ればよい」他のsetterとは非対称な特別扱いであり、実装時に混同しないよう注意。
- したがってルート付近の色・レイアウトを変更するような操作は、この最適化後も実質的に木全体を再計算する。効果が大きいのは「葉ノードのテキスト編集」「特定ノードのvalue/status切り替え」など、継承チェーンに影響しない変更である（実際の利用頻度としてはこちらが大多数のはず）。
- フォントサイズ変更（`adjustFontSize`/ズーム）は全アイテムの実測サイズに影響するため、意図的に「全ノードdirty」の特別扱いとして残す。

## フェーズ計画

### Phase 0 — 計測・現状特性化（コード変更は計測用のみ）

- `layoutSubtree`内の`updateContent`/`measureAndSizeContent`/`writeLayout`それぞれに、訪問したアイテム数を数えるだけの一時的なカウンタを仕込み、以下のシナリオでの「1回のレイアウトパスあたりの訪問数」を記録する:
  - 深い木（50〜100ノード程度）の葉ノード1つのテキストを編集
  - 同じ木で、ルートのcollapsedをトグル
  - 同じ木で、ルートの色を変更
  - フォントサイズズーム
- この数字が、後続フェーズの「効果が出ているか」の唯一の判断材料になる。**Phase 1実装後、数字が実際に改善しないなら、このリファクタは中断してよい**（複雑さを増やすだけの価値のない変更になるため）。
- vitestで`item.test.js`/`action.item.test.js`と同じDOM-freeモックパターンを使い、`markDirty`の伝播ロジック単体（後述Phase 1）に対する回帰テストの土台を先に用意する。

リスク: なし。

---

### Phase 1 — `dirty`フラグと`markDirty()`の導入（挙動はまだ変えない）

- `item.js`のコンストラクタに`this._dirty = true`を追加（新規アイテムは常に初回dirty）。
- 新しいヘルパー`markDirty(item)`を追加（`item.js`内、もしくは小さな専用モジュール`dirty.js`）:
```js
  // Marks item and every ancestor as needing a layout re-visit. Does not
  // touch descendants — see markSubtreeDirty() for the inherited-property
  // case, which is different and used only by color/textColor/shape/layout.
  function markDirty(item) {
    let node = item;
    while (node instanceof Item && !node._dirty) {
      node._dirty = true;
      node = node.parent;
    }
  }
```
- 既存の各setter（`text`/`icon`/`value`/`status`/`notes`/`collapsed`）の末尾で`markDirty(this)`を呼ぶ。`insertChild`/`removeChild`（`_bumpChildrenVersion`の呼び出し箇所）でも同様に呼ぶ。
- この時点では`map.js`側は何も変更しない（`createComputed`は引き続き全ツリーを自動追跡・全再計算する）。`_dirty`フラグは書かれるだけで、まだ誰も読まない。
- 回帰テスト: 深さ3の木を作り、葉のsetterを呼んだときに葉自身とルートまでの祖先全員の`_dirty`がtrueになること、無関係な兄弟ブランチの`_dirty`がfalseのままであることを確認する。

リスク: なし（既存の挙動に一切影響しない、純粋な追加）。

---

### Phase 2 — 継承プロパティ用の`markSubtreeDirty()`

- `color`/`textColor`/`shape`/`layout`の4つのsetterだけは、`markDirty(this)`に加えて、配下全体を再帰的にdirty化する`markSubtreeDirty(item)`も呼ぶ:
```js
  // Unlike markDirty(), this walks downward: resolvedColor/resolvedShape/
  // resolvedLayout are inheritance memos, so changing an item's own
  // color/shape/layout can change the rendered output of every
  // descendant that doesn't override it explicitly.
  function markSubtreeDirty(item) {
    item._dirty = true;
    item.children.forEach(markSubtreeDirty);
  }
```
- 回帰テスト: ルートの`color`を変更したとき、孫ノード（明示的な色を持たない）の`_dirty`もtrueになることを確認。

リスク: 低。対象が4つのsetterに限定されており、見落とすと「継承した色が更新されない」という分かりやすい不具合になるため発見しやすい。

---

### Phase 3 — `createComputed`をバージョンsignalのみに依存させ、`layoutSubtree`をdirty分岐でスキップさせる

- `map.js`の`createComputed`本体を`untrack()`で包み、`layoutVersion()`の読み取りだけをuntrackの外に出す:
```js
  createComputed(() => {
    layoutVersion(); // the only tracked dependency
    if (!this.isVisible) return;
    untrack(() => {
      layoutSubtree(this._root);
      // ... width/height attribute writes, bumpDirty() ...
    });
  });
```
- `updateContent`/`measureAndSizeContent`/`writeLayout`の3関数それぞれの先頭に、dirtyでなければ即returnするガードを追加する:
```js
  function updateContent(item) {
    if (!item._dirty) return;
    // ... 既存の処理はそのまま ...
  }
```
  ※ `measureAndSizeContent`/`writeLayout`も同様。ただし`writeLayout`は**親の`layoutChildren`が子の`position`を書く処理を含む**ため、「子自身のdirty分岐でreturnする」のは子の内部レイアウト（`resolvedLayout.update(child)`の再帰）を止めるだけであり、親から見た子の位置書き込みそのものは親側のパスで従来通り実行される。この境界を混同しないこと。
- `layoutSubtree`の最後（各パスが終わった後）で、訪問した全アイテムの`_dirty`を`false`にリセットする一括処理を追加する。
- 回帰テスト（Phase 0の計測を再利用）: 葉のテキスト編集で「訪問数」がツリーサイズに比例しなくなり、変更経路（葉→祖先）だけに縮小されていることを確認。

リスク: 中。`untrack()`の範囲を誤ると、意図せず他のsignal依存が復活してしまう（＝最適化が無効化されるだけで、正しさには影響しない失敗モード）か、逆に本来追跡すべき何かを見落として更新漏れが起きる（＝正しさに影響する失敗モード）。後者を検出するため、Phase 0で用意した4シナリオに加えて「ドラッグ&ドロップで別の親に付け替える」「undo/redoで色・レイアウトを巻き戻す」も手動確認する。

---

### Phase 4 — シグナル経由ではない全体トリガーの扱い

`requestLayout()`は現在3箇所から呼ばれており、それぞれdirty方式との相性が異なる:

1. **`item.side`変更**（`action.js`のSetSide、`item.js`のmergeWith）— Phase 6の設計メモの通り非reactiveなプレーンフィールド。`SetSide`アクション内で明示的に`markDirty(item)`を呼ぶよう変更する（そのアイテムから祖先までを再計算対象にすれば十分。`side`は`MapLayout.getChildDirection`の左右判定にのみ影響し、継承もしないため`markSubtreeDirty`は不要）。
2. **contenteditableのライブ入力**（`item.js`の`handleEvent`の`"input"`ケース）— 編集中のアイテム自身のサイズが変わりうるので、そのアイテムに対して`markDirty(item)`すれば十分（木全体である必要はない）。
3. **`adjustFontSize`/ズーム**（`map.js`）— フォントサイズはCSSの`font-size`として全アイテムに継承されるため、これだけは意図的に例外として「全ノードdirty」を行う専用関数を用意する:
```js
   // Font-size affects every item's rendered box, unlike per-item
   // property changes above — this is the one legitimate full-tree case,
   // kept explicit rather than folded into markDirty()'s normal path.
   function markAllDirty(item) {
     item._dirty = true;
     item.children.forEach(markAllDirty);
   }
```
   `adjustFontSize`から`requestLayout()`を呼ぶ箇所で、`markAllDirty(this._root)`も併せて呼ぶ。
- 既存の`requestLayout()`自体は「バージョンsignalをbumpするだけ」の役割のまま残し、上記3箇所それぞれが呼び出し前に適切な`markDirty`系関数を呼ぶ、という責務分担にする（`requestLayout()`自身に条件分岐を持たせない方が、1関数1責務というCLAUDE.mdの方針に沿う）。

リスク: 中。3箇所のうち1つでも呼び忘れると「その操作をした時だけレイアウトが更新されない」という分かりやすい不具合になるので、各ケース1本ずつ回帰テストを足す。

---

### Phase 5 — 計測・後片付け・チェックリスト

- Phase 0で仕込んだカウンタで、before/afterの訪問数を比較し、数字として改善を確認する。改善が誤差程度なら、複雑さに見合わないのでPhase 3以降を差し戻すことも検討する（シンプルさ最優先の方針に従う）。
- デバッグ用のカウンタ自体は本番コードに残さず削除する。
- 回帰チェックリスト:
  - 葉ノードのテキスト編集・collapse切り替え・value/status変更で、無関係な兄弟ブランチが再描画されない（DevToolsで`connectors.innerHTML`の再設定有無を確認するか、一時的なconsole.logで検証）。
  - ルートの色・レイアウト変更は従来通り全ノードに反映される（Phase 2の継承ケース）。
  - フォントサイズズームは従来通り全ノードのサイズが更新される。
  - ドラッグ&ドロップでの親付け替え、undo/redoが壊れていない。
  - 大きめの木（50〜100ノード）で体感速度が改善していること。

---

## フェーズ一覧

| Phase | 内容 | リスク | 依存 |
|---|---|---|---|
| 0 | 計測・特性化（本番コード変更なし） | なし | — |
| 1 | `dirty`フラグ + `markDirty()`（上方向） | なし | Phase 0 |
| 2 | `markSubtreeDirty()`（下方向、継承プロパティ用） | 低 | Phase 1 |
| 3 | `createComputed`のuntrack化 + 各フェーズのdirty分岐 | 中 | Phase 1, 2 |
| 4 | 非シグナル系トリガー（side/contenteditable/フォントサイズ）の個別対応 | 中 | Phase 3 |
| 5 | 計測・回帰チェックリスト・後片付け | — | Phase 4 |

各フェーズは独立してマージ可能。Phase 0の計測結果次第では、Phase 1だけで十分な効果が確認できた場合、Phase 3以降を実装しないという判断もあり得る（複雑さと効果のトレードオフを都度確認しながら進める、既存の`docs/01-mindmap-state-refactor.md`と同じ運用方針）。
