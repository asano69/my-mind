import {
  createEffect,
  createResource,
  createSignal,
  For,
  Show,
} from "solid-js";
import ItemNode from "../lib/mindmap/itemStore.js";
import { TOGGLE_SIZE } from "../lib/mindmap/item.js";
import { computeMapLayout } from "../lib/mindmap/layout/map.js";
import { repo as layoutRepo } from "../lib/mindmap/layout/layout.js";
import { repo as shapeRepo } from "../lib/mindmap/shape/shape.js";
import { loadByUuid } from "../lib/mindmap/backend/pocketbase.js";
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

function fallbackContentSizeFor(item) {
  return item.isRoot ? ROOT_CONTENT_SIZE : CHILD_CONTENT_SIZE;
}

function contentSizeFor(item, measuredSizes = new Map()) {
  return measuredSizes.get(item.id) ?? fallbackContentSizeFor(item);
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

function computePreviewLayout(item, childLayouts, measuredSizes) {
  item.contentSize = contentSizeFor(item, measuredSizes);
  for (const childLayout of childLayouts) {
    childLayout.item.size = childLayout.size;
  }
  const result = computeMapLayout(previewLayoutFor(item), item);
  item.size = computedSizeFor(item, result);
  return {
    item,
    childLayouts,
    connectorPaths: result.connectorPaths,
    size: item.size,
  };
}

function textStyleFor(item) {
  const color = item.resolvedTextColor;
  return color ? { color } : {};
}

function underlinePathFor(item) {
  const contentPosition = item.contentPosition ?? [0, 0];
  const contentSize = item.contentSize ?? contentSizeFor(item);
  const left = contentPosition[0];
  const right = left + contentSize[0];
  const top = contentPosition[1] + contentSize[1] - 4 + 0.5;
  return `M ${left} ${top} L ${right} ${top}`;
}

function statusClassFor(item) {
  switch (item.resolvedStatus) {
    case true:
      return "status yes";
    case false:
      return "status no";
    default:
      return "status";
  }
}

function hasStatus(item) {
  return item.resolvedStatus === true || item.resolvedStatus === false;
}

function valueTextFor(item) {
  const value = item.value;
  if (value === null) {
    return "";
  }
  if (typeof value === "number") {
    return String(value);
  }
  const resolved = item.resolvedValue;
  return String(
    Math.round(resolved) === resolved ? resolved : resolved.toFixed(3),
  );
}

function hasNotes(item) {
  return !!item.notes;
}

function alignmentFor(item) {
  return item.resolvedLayout.computeAlignment(item);
}

const D_MINUS = `M ${-(TOGGLE_SIZE - 2)} 0 L ${TOGGLE_SIZE - 2} 0`;
const D_PLUS = `${D_MINUS} M 0 ${-(TOGGLE_SIZE - 2)} L 0 ${TOGGLE_SIZE - 2}`;

// Minimal collapse/expand toggle, matching item.js's buildToggle() glyph
// (a circle with a minus/plus path, same TOGGLE_SIZE imported directly
// from item.js so the two engines can't drift). Clicking mutates the
// preview store's `collapsed` signal directly -- there is no selection
// or undo/redo integration yet, that lands with Phase 4's operation
// integration (see docs/08-mindmap-engine-refactor.md).
function ToggleControl(props) {
  return (
    <g
      class="toggle"
      transform={`translate(${props.position[0]},${props.position[1]})`}
      onClick={() => {
        props.item.collapsed = !props.item.collapsed;
      }}
    >
      <circle cx="0" cy="0" r={TOGGLE_SIZE} />
      <path d={props.item.collapsed ? D_PLUS : D_MINUS} />
    </g>
  );
}

function ItemNodeView(props) {
  let contentRef;

  createEffect(() => {
    const item = props.layout.item;
    measureAndStoreSize(
      item,
      contentRef,
      fallbackContentSizeFor(item),
      props.onMeasure,
    );
  });

  // Memoized (not inlined into the Show below) so both the `when` guard
  // and ToggleControl's `position` prop read the exact same computed
  // value -- computing it twice risked one call seeing a stale
  // connectorPaths reference relative to the other.
  const togglePosition = () => togglePositionFor(props.layout.connectorPaths);

  return (
    <g
      class="item"
      data-shape={props.layout.item.resolvedShape.id}
      data-align={alignmentFor(props.layout.item)}
      transform={props.transform ?? ""}
    >
      <g class="connectors">
        <For each={props.layout.connectorPaths}>
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
      {/* Root's own toggle is never rendered: layoutRoot()'s connector
          descriptors (computeRootConnectors) carry no togglePosition at
          all, matching item.js/map.css's real behavior where the root
          toggle is hidden outright (`svg > .item > .toggle { display:
          none; }`). Guard on the resolved position itself, not just
          children.length, so a null togglePosition (root, or any other
          connector shape that omits it) never reaches ToggleControl. */}
      <Show when={togglePosition()}>
        <ToggleControl item={props.layout.item} position={togglePosition()} />
      </Show>
      <Show when={props.layout.item.resolvedShape.id === "underline"}>
        <path
          class="shape-underline"
          d={underlinePathFor(props.layout.item)}
          stroke={props.layout.item.resolvedColor}
          fill="none"
          stroke-width="2"
        />
      </Show>
      <foreignObject
        x={props.layout.item.contentPosition?.[0] ?? 0}
        y={props.layout.item.contentPosition?.[1] ?? 0}
        width={
          props.layout.item.contentSize?.[0] ??
          contentSizeFor(props.layout.item)[0]
        }
        height={
          props.layout.item.contentSize?.[1] ??
          contentSizeFor(props.layout.item)[1]
        }
      >
        <div
          ref={contentRef}
          class="content"
          style={shapeStyle(props.layout.item)}
        >
          <Show when={hasStatus(props.layout.item)}>
            <span class={statusClassFor(props.layout.item)} />
          </Show>
          <Show when={props.layout.item.value !== null}>
            <span class="value">{valueTextFor(props.layout.item)}</span>
          </Show>
          <Show when={props.layout.item.icon}>
            <span class={`icon fa ${props.layout.item.icon}`} />
          </Show>
          <div
            class="text"
            style={textStyleFor(props.layout.item)}
            innerHTML={props.layout.item.text}
          />
          <Show when={hasNotes(props.layout.item)}>
            <div class="notes" aria-label="Has notes">
              📎
            </div>
          </Show>
        </div>
      </foreignObject>
      <For each={props.layout.childLayouts}>
        {(childLayout) => (
          <ItemNodeView
            layout={childLayout}
            transform={`translate(${childLayout.item.position?.[0] ?? 0},${childLayout.item.position?.[1] ?? 0})`}
            onMeasure={props.onMeasure}
          />
        )}
      </For>
    </g>
  );
}

// Single place both computePreviewTreeLayout() and the JSX recursion
// read to decide which children are part of the visible tree -- mirrors
// item.js's `!item.collapsed && item.children.forEach(...)` guard, kept
// here rather than inlined so the "what counts as visible" definition
// can't drift between the layout pass and the render pass.
export function visiblePreviewChildren(item) {
  return item.collapsed ? [] : item.childItems;
}

// Extracts the connector layout's togglePosition, shared by every
// layout kind (graph/tree/map, see layout/*.js's writeConnectorPaths).
// A collapsed item's connector descriptors carry only togglePosition
// (no `d`), so this still resolves correctly while collapsed -- the
// toggle glyph must stay addressable so the node can be re-expanded.
export function togglePositionFor(connectorPaths) {
  const withToggle = connectorPaths.find((path) => path.togglePosition);
  return withToggle ? withToggle.togglePosition : null;
}

export function computePreviewTreeLayout(item, measuredSizes = new Map()) {
  const childLayouts = visiblePreviewChildren(item).map((child) =>
    computePreviewTreeLayout(child, measuredSizes),
  );
  return computePreviewLayout(item, childLayouts, measuredSizes);
}

export function measureContentSize(element, fallbackSize) {
  if (!element) {
    return fallbackSize;
  }
  const width = Math.ceil(
    Math.max(element.offsetWidth || 0, element.scrollWidth || 0),
  );
  const height = Math.ceil(
    Math.max(element.offsetHeight || 0, element.scrollHeight || 0),
  );
  return [width || fallbackSize[0], height || fallbackSize[1]];
}

function sameSize(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function measureAndStoreSize(item, element, fallbackSize, updateMeasuredSize) {
  const measured = measureContentSize(element, fallbackSize);
  updateMeasuredSize(item.id, measured);
}

export function createPreviewRoot(title) {
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

export function rootFromMapData(data) {
  const rootData = data?.root;
  if (!rootData) {
    return null;
  }
  return ItemNode.fromJSON(rootData);
}

async function loadPreviewRoot(uuid, fallbackTitle) {
  if (!uuid) {
    return createPreviewRoot(fallbackTitle);
  }
  const record = await loadByUuid(uuid);
  return rootFromMapData(record.mymind) ?? createPreviewRoot(fallbackTitle);
}

export default function NewMindMapPreview(props) {
  const [root] = createResource(
    () => ({ uuid: props.uuid ?? null, title: props.title }),
    ({ uuid, title }) => loadPreviewRoot(uuid, title),
  );
  const [measuredSizes, setMeasuredSizes] = createSignal(new Map());
  const updateMeasuredSize = (id, size) => {
    setMeasuredSizes((current) => {
      const existing = current.get(id);
      if (existing && sameSize(existing, size)) {
        return current;
      }
      const next = new Map(current);
      next.set(id, size);
      return next;
    });
  };
  const layout = () => {
    const loadedRoot = root();
    return loadedRoot
      ? computePreviewTreeLayout(loadedRoot, measuredSizes())
      : null;
  };

  return (
    <svg
      data-engine="solid-item-node-preview"
      width="640"
      height="240"
      style={{ "font-size": "15px", left: "40px", top: "40px" }}
    >
      <style>{mapCss}</style>
      <Show
        when={layout()}
        fallback={
          <text class="content" x="40" y="64">
            Loading map...
          </text>
        }
      >
        {(currentLayout) => (
          <g transform="translate(40,40)">
            <ItemNodeView
              layout={currentLayout()}
              onMeasure={updateMeasuredSize}
            />
          </g>
        )}
      </Show>
    </svg>
  );
}
