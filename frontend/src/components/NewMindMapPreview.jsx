import { For, createMemo } from "solid-js";
import ItemNode from "../lib/mindmap/itemStore.js";
import { computeMapLayout } from "../lib/mindmap/layout/map.js";
import { repo as layoutRepo } from "../lib/mindmap/layout/layout.js";
import { repo as shapeRepo } from "../lib/mindmap/shape/shape.js";
import "../lib/mindmap/layout/map.js";
import "../lib/mindmap/shape/box.js";
import "../lib/mindmap/shape/ellipse.js";
import "../lib/mindmap/shape/underline.js";
import mapCss from "../lib/mindmap/map.css?raw";

const ROOT_CONTENT_SIZE = [220, 72];
const CHILD_CONTENT_SIZE = [150, 44];

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

function contentSizeFor(item) {
  return item.isRoot ? ROOT_CONTENT_SIZE : CHILD_CONTENT_SIZE;
}

function previewLayoutFor(item) {
  let node = item;
  while (node) {
    if (node.layout) {
      return node.layout;
    }
    node = node.parent;
  }
  return layoutRepo.get("map");
}

function computedSizeFor(item, layoutResult) {
  let width = item.contentPosition[0] + item.contentSize[0];
  let height = item.contentPosition[1] + item.contentSize[1];
  if (!item.collapsed) {
    for (const child of item.childItems) {
      width = Math.max(width, (child.position?.[0] ?? 0) + child.size[0]);
      height = Math.max(height, (child.position?.[1] ?? 0) + child.size[1]);
    }
  }
  return [layoutResult.width ?? width, layoutResult.height ?? height];
}

function computePreviewLayout(item, childLayouts) {
  item.contentSize = contentSizeFor(item);
  for (const childLayout of childLayouts) {
    childLayout.item.size = childLayout.size;
  }
  const result = computeMapLayout(previewLayoutFor(item), item);
  item.size = computedSizeFor(item, result);
  return { item, connectorPaths: result.connectorPaths, size: item.size };
}

function ItemNodeView(props) {
  const children = createMemo(() => props.item.childItems);
  const childLayouts = createMemo(() => props.childLayouts?.() ?? []);
  const layoutResult = createMemo(() =>
    computePreviewLayout(props.item, childLayouts()),
  );
  const shape = createMemo(() => props.item.resolvedShape);
  const textStyle = createMemo(() => {
    const color = props.item.resolvedTextColor;
    return color ? { color } : {};
  });

  return (
    <g class="item" data-shape={shape().id} transform={props.transform ?? ""}>
      <g class="connectors">
        <For each={layoutResult().connectorPaths}>
          {(pathInfo) =>
            pathInfo.d ? (
              <path
                d={pathInfo.d}
                stroke={pathInfo.stroke}
                fill={pathInfo.fill ?? "none"}
                stroke-width="2"
              />
            ) : null
          }
        </For>
      </g>
      <foreignObject
        x={props.item.contentPosition?.[0] ?? 0}
        y={props.item.contentPosition?.[1] ?? 0}
        width={props.item.contentSize?.[0] ?? contentSizeFor(props.item)[0]}
        height={props.item.contentSize?.[1] ?? contentSizeFor(props.item)[1]}
      >
        <div class="content" style={shapeStyle(props.item)}>
          <span class="text" style={textStyle()}>
            {props.item.text}
          </span>
        </div>
      </foreignObject>
      <For each={children()}>
        {(child) => (
          <RecursiveItemNodeView
            item={child}
            transform={`translate(${child.position?.[0] ?? 0},${child.position?.[1] ?? 0})`}
          />
        )}
      </For>
    </g>
  );
}

function RecursiveItemNodeView(props) {
  const childLayouts = createMemo(() =>
    props.item.childItems.map((child) => computePreviewTreeLayout(child)),
  );
  return (
    <ItemNodeView
      item={props.item}
      childLayouts={childLayouts}
      transform={props.transform}
    />
  );
}

export function computePreviewTreeLayout(item) {
  const childLayouts = item.childItems.map((child) =>
    computePreviewTreeLayout(child),
  );
  return computePreviewLayout(item, childLayouts);
}

function createPreviewRoot(title) {
  const root = new ItemNode();
  root.text = title;
  root.layout = layoutRepo.get("map");
  root.shape = shapeRepo.get("ellipse");
  root.color = "#f6d365";

  const left = new ItemNode();
  left.text = "Left branch";
  left.side = "left";
  const right = new ItemNode();
  right.text = "Right branch";
  right.side = "right";
  const detail = new ItemNode();
  detail.text = "Nested detail";
  right.insertChild(detail);
  root.insertChild(left);
  root.insertChild(right);
  return root;
}

export default function NewMindMapPreview(props) {
  const root = createMemo(() => createPreviewRoot(props.title));

  return (
    <svg
      data-engine="solid-item-node-preview"
      width="640"
      height="240"
      style={{ "font-size": "15px", left: "40px", top: "40px" }}
    >
      <style>{mapCss}</style>
      <g transform="translate(40,40)">
        <RecursiveItemNodeView item={root()} />
      </g>
    </svg>
  );
}
