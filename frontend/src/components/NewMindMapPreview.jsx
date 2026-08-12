import { createEffect, createResource, For, Show } from "solid-js";
import ItemNode from "../lib/mindmap/itemStore.js";
import { TOGGLE_SIZE } from "../lib/mindmap/item.js";
import { repo as layoutRepo } from "../lib/mindmap/layout/layout.js";
import { repo as shapeRepo } from "../lib/mindmap/shape/shape.js";
import { loadByUuid } from "../lib/mindmap/backend/pocketbase.js";
import "../lib/mindmap/layout/map.js";
import "../lib/mindmap/shape/box.js";
import "../lib/mindmap/shape/ellipse.js";
import "../lib/mindmap/shape/underline.js";
import mapCss from "../lib/mindmap/map.css?raw";

// Phase 3.5 (see docs/08-mindmap-engine-refactor.md): layout computation
// (computeMapLayout, content-size fallbacks, measured-size bookkeeping)
// moved into itemStore.js's ItemNode.layoutResult/defaultContentSize/
// setMeasuredSize. This file only reads that memo and writes measured
// sizes back to it from a createEffect -- see ItemNodeView below.

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

// Renders one item and recurses into its visible children. Reads
// props.item.layoutResult() itself (rather than receiving a pre-computed
// snapshot from the parent) so that <For>'s default identity-based
// reconciliation below can key each child on the stable ItemNode
// instance -- if the parent instead passed down a fresh layout snapshot
// object on every recompute, <For> would see a "new" object at that
// index even for an untouched child and needlessly unmount/remount its
// whole subtree (see docs/08-mindmap-engine-refactor.md's Phase 3.5
// design notes).
//
// contentPosition/contentSize/position (see itemStore.js) are plain,
// non-reactive fields written as a side effect of layoutResult's own
// computation -- reading them safely requires first reading layout()
// (the memo itself) in the same tracked scope, which is why every
// accessor below that touches one of those fields calls layout() first.
function ItemNodeView(props) {
  let contentRef;
  const layout = () => props.item.layoutResult();

  const box = () => {
    layout();
    const item = props.item;
    return [
      item.contentPosition?.[0] ?? 0,
      item.contentPosition?.[1] ?? 0,
      item.contentSize?.[0] ?? 0,
      item.contentSize?.[1] ?? 0,
    ];
  };

  const underlineD = () => {
    layout();
    return underlinePathFor(props.item);
  };

  const togglePosition = () => togglePositionFor(layout().connectorPaths);

  // The ONLY signal write for this item: strictly after Solid has
  // committed contentRef to the DOM, in an effect -- never inside
  // layoutResult's own computation (see itemStore.js's _computeLayout()
  // comment and this file's header note on Phase 3.4's post-mortem).
  createEffect(() => {
    const item = props.item;
    const measured = measureContentSize(contentRef, item.defaultContentSize());
    item.setMeasuredSize(measured);
  });

  return (
    <g
      class="item"
      data-shape={props.item.resolvedShape.id}
      data-align={alignmentFor(props.item)}
      transform={props.transform ? props.transform() : ""}
    >
      <g class="connectors">
        <For each={layout().connectorPaths}>
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
        <ToggleControl item={props.item} position={togglePosition()} />
      </Show>
      <Show when={props.item.resolvedShape.id === "underline"}>
        <path
          class="shape-underline"
          d={underlineD()}
          stroke={props.item.resolvedColor}
          fill="none"
          stroke-width="2"
        />
      </Show>
      <foreignObject x={box()[0]} y={box()[1]} width={box()[2]} height={box()[3]}>
        <div ref={contentRef} class="content" style={shapeStyle(props.item)}>
          <Show when={hasStatus(props.item)}>
            <span class={statusClassFor(props.item)} />
          </Show>
          <Show when={props.item.value !== null}>
            <span class="value">{valueTextFor(props.item)}</span>
          </Show>
          <Show when={props.item.icon}>
            <span class={`icon fa ${props.item.icon}`} />
          </Show>
          <div
            class="text"
            style={textStyleFor(props.item)}
            innerHTML={props.item.text}
          />
          <Show when={hasNotes(props.item)}>
            <div class="notes" aria-label="Has notes">
              📎
            </div>
          </Show>
        </div>
      </foreignObject>
      <For each={visiblePreviewChildren(props.item)}>
        {(child) => (
          <ItemNodeView
            item={child}
            // Bound to the PARENT's own layout() (not the child's): a
            // child's `position` field is written as a side effect of
            // ITS PARENT's _computeLayout(), not its own -- see
            // itemStore.js's layoutChildren() usage. Passed as an
            // accessor (not a plain string) so <For> can still key this
            // entry on `child` itself for reconciliation, while the
            // transform attribute stays live.
            transform={() => {
              layout();
              return `translate(${child.position?.[0] ?? 0},${child.position?.[1] ?? 0})`;
            }}
          />
        )}
      </For>
    </g>
  );
}

// Single place both layoutResult()'s computation (see itemStore.js) and
// the JSX recursion above read to decide which children are part of the
// visible tree -- mirrors item.js's `!item.collapsed && item.children
// .forEach(...)` guard, kept here rather than inlined so the "what
// counts as visible" definition can't drift between the two.
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

  return (
    <svg
      data-engine="solid-item-node-preview"
      width="640"
      height="240"
      style={{ "font-size": "15px", left: "40px", top: "40px" }}
    >
      <style>{mapCss}</style>
      <Show
        when={root()}
        fallback={
          <text class="content" x="40" y="64">
            Loading map...
          </text>
        }
      >
        {(loadedRoot) => (
          <g transform="translate(40,40)">
            <ItemNodeView item={loadedRoot()} />
          </g>
        )}
      </Show>
    </svg>
  );
}
