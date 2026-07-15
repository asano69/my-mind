# DeepWiki Q&A with Code Context for Repository: BaffinLee/mindmap
## Q1
マインドマップのノードをドラッグしているとき、もっとも近いノードへの直線がリアルタイムではられるが、どのような仕組みなのか
### Answer
マインドマップのノードをドラッグ中に最も近いノードへの直線がリアルタイムで描画される仕組みについて説明します。

## 概要

ドラッグ中の直線描画は、SVG要素とCSSクラス制御、そしてマウスイベントハンドリングの組み合わせで実現されています。 mindmap:17-19 mindmap:177-189 

## 仕組みの詳細

### 1. SVG要素の配置
`.drag-line` というSVG要素が `.content` レイヤー内に配置され、ドラッグラインの描画に使用されます。 mindmap:17-19 

### 2. CSSによる表示制御
`.drag-line` はデフォルトで `display: none` に設定されていますが、`body` に `.node-dragging` クラスが付与されると表示されます。 mindmap:205-208 mindmap:42-46 

### 3. リアルタイム描画処理
`drawDropLine()` 関数がマウス移動時に呼び出され、以下の処理を行います： mindmap:177-189 

- ドロップターゲット（`dropId`）がない場合、ラインを非表示にする
- ドロップターゲットがある場合、始点と終点の座標を計算：
  - **始点**: 親ノードの右端中央 (`parent.x + parent.contentWidth`, `parent.y + parent.contentHeight / 2`)
  - **終点**: ドラッグ中のノードの位置（スケールとトランスレートを考慮して調整）
- `setPath()` 関数でSVGパスを更新

### 4. イベントフロー
マウスイベントハンドラ `handleMouseMove()` 内で、ドラッグ中に以下の順序で処理が実行されます： mindmap:207-218 

1. `moveSnapshot()` - ドラッグプレビューの移動
2. `findDropParent()` - 最も近いドロップターゲットの検索
3. `drawDropLine()` - ラインの描画更新

## Notes
- ドラッグラインのz-indexは2に設定されており、ノードとコントロールバーの間に配置されます mindmap:1-7 
- ドラッグ終了時、`endDrag()` 関数でラインがクリアされ、`.node-dragging` クラスが削除されます mindmap:191-205 

Wiki pages you might want to explore:
- [Glossary (BaffinLee/mindmap)](/wiki/BaffinLee/mindmap#10)
- [UI Structure & Styling (BaffinLee/mindmap)](/wiki/BaffinLee/mindmap#7)
### Citations
**File:** src/index.html (L17-19)
```html
            <svg class="line" xmlns="http://www.w3.org/2000/svg" version="1.1"></svg>
            <div class="map"></div>
            <svg class="drag-line" xmlns="http://www.w3.org/2000/svg" version="1.1"></svg>
```
**File:** src/modules/drag.ts (L177-189)
```typescript
    const drawDropLine = () => {
        if (!dropId) {
            unsetPath(line);
            return;
        }
        const parent = root.map[dropId];
        const dragNode = root.map[dragId];
        const x = snapshotPos.x;
        const y = snapshotPos.y + dragNode.contentHeight / 2;
        const start = { x: parent.x + parent.contentWidth, y: parent.y + (parent.contentHeight / 2) };
        const end = { x: x / stage.getScale() - stage.getTranslate().x, y: y / stage.getScale() - stage.getTranslate().y };
        setPath(line, start, end, parent.id, snapshot.id);
    };
```
**File:** src/modules/drag.ts (L191-205)
```typescript
    const endDrag = () => {
        snapshot && snapshot.remove();
        dragRect && dragRect.remove();
        unsetPath(line);
        document.body.classList.remove('node-dragging');
        if (!dropId) return;
        const parent = root.map[dropId];
        let index = dropIndex;
        parent.children.forEach((child, i) => {
            if (dragIdMap[child.id] && i < dropIndex) {
                index -= 1;
            }
        });
        command.execute(CommandName.MoveNode, dropId, index, dragIds);
    };
```
**File:** src/modules/drag.ts (L207-218)
```typescript
    const handleMouseMove = (event: MouseEvent) => {
        if (dragIds.length === 0) return;
        if (!dragging && (Math.abs(event.clientX - mousePos.x) > 2 || Math.abs(event.clientY - mousePos.y) > 2)) {
            dragging = true;
            startDrag();
            selection.unselect();
        }
        if (!dragging) return;
        moveSnapshot(event.clientX, event.clientY);
        findDropParent();
        drawDropLine();
    };
```
**File:** src/index.less (L1-7)
```less
@contentZIndex: 1;
@bottomBtnsZindex: 2;
@dragLineZIndex: 2;
@scrollerZIndex: 3;
@selectionRectZIndex: 4;
@draggingRectZIndex: 5;
@draggingZIndex: 6;
```
**File:** src/index.less (L42-46)
```less
    &.node-dragging {
        .drag-line {
            display: block;
        }
    }
```
**File:** src/index.less (L205-208)
```less
.drag-line {
    display: none;
    z-index: @dragLineZIndex;
}
```