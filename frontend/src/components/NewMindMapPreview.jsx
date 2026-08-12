import { createMemo } from "solid-js";
import ItemNode from "../lib/mindmap/itemStore.js";
import { repo as layoutRepo } from "../lib/mindmap/layout/layout.js";
import { repo as shapeRepo } from "../lib/mindmap/shape/shape.js";
import "../lib/mindmap/layout/map.js";
import "../lib/mindmap/shape/box.js";
import "../lib/mindmap/shape/ellipse.js";
import "../lib/mindmap/shape/underline.js";
import mapCss from "../lib/mindmap/map.css?raw";

const ROOT_CONTENT_POSITION = [80, 40];
const ROOT_CONTENT_SIZE = [220, 72];

function shapeStyle(item) {
  const raw = item.color;
  const resolved = item.resolvedColor;
  const style = {};

  if (raw && raw !== "#ffffff") {
    style["--item-color"] = raw;
    return style;
  }

  if (
    item.resolvedShape.id === "box" &&
    resolved !== "#999" &&
    resolved !== "#999999"
  ) {
    style["--item-color"] = resolved;
    return style;
  }

  style["border-color"] = resolved;
  return style;
}

function ItemNodeView(props) {
  const shape = createMemo(() => props.item.resolvedShape);
  const textStyle = createMemo(() => {
    const color = props.item.resolvedTextColor;
    return color ? { color } : {};
  });

  return (
    <g class="item" data-shape={shape().id}>
      <g class="connectors" />
      <foreignObject
        x={ROOT_CONTENT_POSITION[0]}
        y={ROOT_CONTENT_POSITION[1]}
        width={ROOT_CONTENT_SIZE[0]}
        height={ROOT_CONTENT_SIZE[1]}
      >
        <div class="content" style={shapeStyle(props.item)}>
          <span class="text" style={textStyle()}>
            {props.item.text}
          </span>
        </div>
      </foreignObject>
    </g>
  );
}

function createPreviewRoot(title) {
  const root = new ItemNode();
  root.text = title;
  root.layout = layoutRepo.get("map");
  root.shape = shapeRepo.get("ellipse");
  root.color = "#f6d365";
  return root;
}

export default function NewMindMapPreview(props) {
  const root = createMemo(() => createPreviewRoot(props.title));

  return (
    <svg
      data-engine="solid-item-node-preview"
      width="380"
      height="170"
      style={{ "font-size": "15px", left: "40px", top: "40px" }}
    >
      <style>{mapCss}</style>
      <ItemNodeView item={root()} />
    </svg>
  );
}
