import {
  createEffect,
  createResource,
  For,
  Show,
  onCleanup,
  onMount,
} from "solid-js";
import ItemNode, { measureContentSize } from "../lib/mindmap/itemStore.js";
import { itemStateClassList } from "../lib/mindmap/itemSelection.js";
import {
  handleItemClick,
  handleItemDblClick,
  handleItemLinkClick,
} from "../lib/mindmap/newMouse.js";
import { registerDomRefs } from "../lib/mindmap/newEdit.js";
import * as newMouse from "../lib/mindmap/newMouse.js";
import * as newClipboard from "../lib/mindmap/newClipboard.js";
import * as newViewport from "../lib/mindmap/newViewport.js";
import * as io from "../lib/mindmap/ui/io.js";
import * as newIo from "../lib/mindmap/newIo.js";
import { bumpDirty, titleAuto, setCurrentTitle } from "../lib/mindmap/store.js";
import { TOGGLE_SIZE } from "../lib/mindmap/item.js";
import { repo as layoutRepo } from "../lib/mindmap/layout/layout.js";
import { repo as shapeRepo } from "../lib/mindmap/shape/shape.js";
import { loadByUuid } from "../lib/mindmap/backend/pocketbase.js";
import "../lib/mindmap/layout/map.js";
// Named imports also run each module's own registration side effect
// (new Box()/new Ellipse()/new Underline()), so the old blank
// import "../lib/mindmap/shape/box.js" style imports are no longer
// needed alongside these (see docs/08-mindmap-engine-refactor.md's
// Phase 3.7: this preview now shares the same pure style/path
// functions the real engine's shape/*.js update() methods use, instead
// of duplicating that branching here).
import { computeBoxStyle } from "../lib/mindmap/shape/box.js";
import { computeEllipseStyle } from "../lib/mindmap/shape/ellipse.js";
import { computeUnderlinePath } from "../lib/mindmap/shape/underline.js";
import mapCss from "../lib/mindmap/map.css?raw";

// Phase 3.5 (see docs/08-mindmap-engine-refactor.md): layout computation
// (computeMapLayout, content-size fallbacks, measured-size bookkeeping)
// moved into itemStore.js's ItemNode.layoutResult/defaultContentSize/
// setMeasuredSize. This file only reads that memo and writes measured
// sizes back to it from a createEffect -- see ItemNodeView below.

// Delegates to the same pure functions shape/box.js and shape/ellipse.js
// use for the real engine's DOM updates (see docs/08-mindmap-engine-
// refactor.md's Phase 3.7), instead of duplicating their branching here.
// Every non-box shape (ellipse, underline, ...) shares ellipse's simpler
// fallback, matching this function's own previous behavior.
function shapeStyle(item) {
  const { itemColor, borderColor } =
    item.resolvedShape.id === "box"
      ? computeBoxStyle(item)
      : computeEllipseStyle(item);
  return itemColor
    ? { "--item-color": itemColor }
    : { "border-color": borderColor };
}

function textStyleFor(item) {
  const color = item.resolvedTextColor;
  return color ? { color } : {};
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

  const underlinePath = () => {
    layout();
    return computeUnderlinePath(props.item);
  };

  const togglePosition = () => togglePositionFor(layout().connectorPaths);

  // Registers/unregisters this item's content element in the shared
  // domRefs Map (see registerDomRef/unregisterDomRef above), created
  // once by the top-level NewMindMapPreview and threaded down through
  // every recursive ItemNodeView instance (see the <For> below and
  // NewMindMapPreview's own render). Refs are attached before onMount
  // runs, so contentRef is guaranteed to be a real element here.
  // Read by newEdit.js (Phase 4.5) to locate an item's text element for
  // live editing; mouse.js's drag math (Phase 4.7) and clipboard.js's
  // cut-visual toggling (Phase 4.8) are still pending consumers.
  //
  // Content-box remeasurement also happens here, via a ResizeObserver
  // rather than a plain createEffect(). A createEffect() with no
  // tracked signal reads inside it only ever runs once, at mount --
  // which is exactly what was happening before this fix: the callback
  // read `contentRef` (a plain variable, not a signal) and
  // `item.defaultContentSize()` (a pure function of `item.isRoot`, no
  // signal reads either), so Solid never re-ran it after the initial
  // measurement. That silently broke remeasurement for every later
  // change that can resize the content box -- a status/value/icon/
  // notes indicator appearing or disappearing, a shape change altering
  // CSS padding, a text edit, ... -- leaving stale contentSize/
  // foreignObject dimensions and overlapping nodes. The old engine
  // (item.js) doesn't have this problem: updateStatus()/updateValue()/
  // _applyOwnStyle() write the DOM and _measureOwnContent() reads it
  // back synchronously inside the very same reactive layout pass (see
  // item.js's computeLayout()). Rather than re-deriving the full list
  // of signals that can affect content size here (and relying on this
  // effect running after the JSX's own reactive DOM bindings, which
  // isn't guaranteed by declaration order), a ResizeObserver watches
  // the actual rendered box directly and fires on any real size
  // change, including the initial one.
  onMount(() => {
    registerDomRef(props.domRefs, props.item, contentRef);
    const resizeObserver = new ResizeObserver(() => {
      const item = props.item;
      const measured = measureContentSize(contentRef, item.defaultContentSize());
      item.setMeasuredSize(measured);
    });
    resizeObserver.observe(contentRef);
    onCleanup(() => resizeObserver.disconnect());
  });
  onCleanup(() => {
    unregisterDomRef(props.domRefs, props.item);
  });

  return (
    <g
      class="item"
      classList={itemStateClassList(props.item)}
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
          d={underlinePath().d}
          stroke={underlinePath().stroke}
          fill="none"
          stroke-width="2"
        />
      </Show>
      <foreignObject x={box()[0]} y={box()[1]} width={box()[2]} height={box()[3]}>
        <div
          ref={contentRef}
          class="content"
          style={shapeStyle(props.item)}
          onClick={(e) => handleItemClick(props.item, e)}
          onDblClick={(e) => handleItemDblClick(props.item, e)}
        >
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
          {/* Link icon: same lucide "link-2" path as item.js's
              buildLinkIcon(), rendered as a plain JSX element instead of
              an imperatively built SVG node -- see newMouse.js's
              handleItemLinkClick for the click behavior it shares with
              the old engine. Reuses map.css's ".item .link-icon" rule
              (already injected via <style>{mapCss}</style> above), so no
              new CSS is needed here. */}
          <Show when={props.item.url}>
            <span class="link-icon" onClick={() => handleItemLinkClick(props.item)}>
              <svg viewBox="0 0 36 36" fill="none">
                <path
                  d="M34,17H28.23A6.25,6.25,0,0,0,22,12H14.15a6.25,6.25,0,0,0-6.21,5H2v2H7.93a6.22,6.22,0,0,0,6.22,5H22a6.22,6.22,0,0,0,6.22-5H34ZM17.08,22H14.15a4.17,4.17,0,0,1-4.31-4,4.17,4.17,0,0,1,4.31-4h2.94ZM22,22H19V14h3a4.17,4.17,0,0,1,4.31,4A4.17,4.17,0,0,1,22,22Z"
                  fill="currentColor"
                />
              </svg>
            </span>
          </Show>
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
            domRefs={props.domRefs}
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

// Indirect DOM reference registry: Map<item.id, HTMLElement>. Lets a
// vanilla module (mouse.js's drag math in Phase 4.7, clipboard.js's
// cut-visual toggling in Phase 4.8) locate an item's rendered content
// element without touching item.dom directly, since ItemNode (the
// Phase 1 data store) never holds a DOM reference itself -- see
// docs/08-phase4.0-dependency-inventory.md, section 9. Kept as two
// tiny pure functions (rather than inlined in ItemNodeView's
// onMount/onCleanup) so registration/cleanup can be unit-tested
// without rendering an actual Solid component tree.
export function registerDomRef(domRefs, item, el) {
  domRefs.set(item.id, el);
}
export function unregisterDomRef(domRefs, item) {
  domRefs.delete(item.id);
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

// Re-exported here since NewMindMapPreview.test.jsx imports it from this
// file -- the implementation itself now lives in itemStore.js (see
// measureContentSize's own comment there), since newEdit.js's
// commitEditing() also needs it (Phase 4.5).
export { measureContentSize };

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

export default function NewMindMapPreview(props) {
  // Set by loadPreviewRoot() below whenever a real saved map was loaded
  // (stays null for a brand-new, unsaved map) -- read by the
  // root-loaded effect further down to restore io.js's currentMapId/
  // currentMapUuid/title bookkeeping via newIo.applyLoadedRecord(), the
  // same bookkeeping the old engine's io.restore() applies internally.
  let lastLoadedRecord = null;

  async function loadPreviewRoot(uuid, fallbackTitle) {
    if (!uuid) {
      lastLoadedRecord = null;
      return createPreviewRoot(fallbackTitle);
    }
    const record = await loadByUuid(uuid);
    lastLoadedRecord = record;
    return rootFromMapData(record.mymind) ?? createPreviewRoot(fallbackTitle);
  }

  const [root] = createResource(
    () => ({ uuid: props.uuid ?? null, title: props.title }),
    ({ uuid, title }) => loadPreviewRoot(uuid, title),
  );

  // Plain (non-reactive) Map, not a signal: this registry is an
  // imperative side-table for later phases (see registerDomRef's
  // comment above), not something any component reads reactively.
  // Created once per NewMindMapPreview mount -- Solid component bodies
  // run once, not on every re-render, so this persists across
  // subsequent resource updates without needing memoization.
  const domRefs = new Map();
  // Lets newEdit.js (a vanilla module outside Solid's component tree)
  // locate an item's rendered text element by id -- same bridge pattern
  // as item.js's registerNavigate()/notes.js's registerEditorAPI().
  registerDomRefs(domRefs);
  onCleanup(() => registerDomRefs(null));

  // Wires mousedown/mousemove/mouseup/click drag-and-drop handling onto
  // this component's own <svg> root (see newMouse.js's Stage 4.7.3).
  // Previously this module only built newMouse.js's helpers/tests
  // without ever calling init() from a real component -- drag-and-drop
  // silently did nothing as a result. getRoot is passed as a function
  // (not the resource's current value) since the tree can still be
  // loading, or the user can switch maps, after this component mounts.
  let svgRef;
  onMount(() => {
    // Initial position matches this <svg>'s own static left/top below
    // (40px, 40px), so wiring pan/zoom in doesn't cause a visible jump
    // on mount.
    newViewport.init(svgRef, [40, 40]);
    // Mouse/wheel listeners are registered on the full-viewport
    // container, not on svgRef itself. svgRef is only sized to its own
    // content (640x240, see below) -- wheel/mousedown events only
    // bubble through it while the pointer happens to be over a
    // descendant node (e.g. near the root), so hovering empty canvas
    // space never reached newMouse.js, and dragging past that small
    // box's edge silently stopped delivering mousemove ("catches").
    // Using a full-size HTML container as the port also fixes
    // buildDragGhost() appending an HTML <div> ghost directly into an
    // <svg> (invalid outside a <foreignObject>, see
    // docs/08-phase4.7-drag-and-drop-refactor.md's known follow-up) --
    // containerEl is a plain HTML element, so the ghost now has a valid
    // parent.
    const port = props.containerEl ?? svgRef;
    newMouse.init(domRefs, port, port, () => root());
    // Registers this preview as the source the "center map" command
    // (see newContextMenuCommands.js) reads from -- see newViewport.js's
    // registerCenterSource() for why this indirection is needed.
    newViewport.registerCenterSource(
      () => root()?.size,
      () => {
        const containerRect = (
          props.containerEl ?? svgRef.parentNode
        )?.getBoundingClientRect();
        return containerRect
          ? [containerRect.width, containerRect.height]
          : [window.innerWidth, window.innerHeight];
      },
    );
    // Listens on `document`'s capture phase, not this component's own
    // <svg> ref -- see newClipboard.js's header comment and
    // docs/d01-clipboard-event-targeting.md for why cut/copy/paste can't
    // be scoped to a container element the way mousedown/keydown can.
    newClipboard.init(domRefs);
    // Registers the debounced auto-save effect and loads the persisted
    // auto-save preference (see ui/io.js's init()). The old engine's
    // my-mind.js mount() does this via ui.init(); the new engine never
    // called it, which is why Save/Delete/auto-save silently did
    // nothing under ?newEngine=1 until this call was added.
    io.init();
  });
  onCleanup(() => {
    newMouse.dispose();
    newClipboard.dispose();
    newViewport.dispose();
    io.dispose();
    newIo.detach();
  });

  // Keeps the root node visually anchored across layout recomputes, and
  // centers it in the viewport the first time it actually lays out --
  // mirrors map.js's show()/center()/_anchorRootPosition() for the old
  // engine (see newViewport.js's own comments for the ported logic).
  // `centered`/`lastRootSeen` are plain (non-reactive) locals: a Solid
  // component body runs once per mount, so both naturally reset
  // whenever this component is recreated (e.g. switching maps, see
  // Workspace.jsx's canvasKey), and lastRootSeen also lets a same-mount
  // root swap (e.g. props.uuid changing without a remount) re-center
  // instead of silently keeping the previous root's anchor baseline.
  let centered = false;
  let lastRootSeen = null;
  // Skips the very first layout pass after a (re)load from bumping
  // dirtyVersion -- otherwise loading a saved map would immediately look
  // like an edit and trigger a pointless auto-save of unchanged data
  // (see ui/io.js's dirtyVersion effect).
  let dirtyArmed = false;
  createEffect(() => {
    const loadedRoot = root();
    if (!loadedRoot || !svgRef) {
      return;
    }
    if (loadedRoot !== lastRootSeen) {
      lastRootSeen = loadedRoot;
      centered = false;
      dirtyArmed = false;
      newViewport.resetAnchor();
      // Registers this root/svg as the source ui/io.js's save/autosave
      // logic reads from (see newIo.js). Only apply the loaded record's
      // bookkeeping when a real saved map was actually loaded -- doing
      // this unconditionally for a brand-new map would prematurely
      // rewrite the URL to "/" before the user ever saves (mirrors the
      // old engine's io.restore(), which only calls its own
      // setCurrentMap() when a record was actually found).
      newIo.attach(loadedRoot, svgRef);
      if (lastLoadedRecord) {
        newIo.applyLoadedRecord(lastLoadedRecord);
      }
    }
    // Reading layoutResult() here (rather than only contentPosition/size
    // directly) is what subscribes this effect to every relevant layout
    // change -- contentPosition/size are plain fields written as a side
    // effect of the memo's own computation, so they must only be read
    // after pulling the memo in the same tracked scope (see
    // itemStore.js's header comment).
    loadedRoot.layoutResult();
    // Keeps the <svg>'s own width/height in sync with the actual content
    // bounding box, mirroring map.js's layout computed (which calls
    // `this.node.setAttribute("width"/"height", ...)` on every pass).
    // Without this, the <svg> stayed at its hardcoded 640x240 default
    // forever, which serializeCurrentMap() (see backend/image.js) reads
    // as the content size when building a saved map's thumbnail --
    // producing a wrongly cropped/offset export unrelated to what's
    // actually on screen.
    svgRef.setAttribute("width", String(loadedRoot.size[0]));
    svgRef.setAttribute("height", String(loadedRoot.size[1]));
    newViewport.anchorRootPosition(loadedRoot.contentPosition);
    if (!centered) {
      const containerRect = (
        props.containerEl ?? svgRef.parentNode
      )?.getBoundingClientRect();
      const containerSize = containerRect
        ? [containerRect.width, containerRect.height]
        : [window.innerWidth, window.innerHeight];
      newViewport.center(loadedRoot.size, containerSize);
      centered = true;
    }
    // Keeps the map's title synced to the root node's label whenever
    // titleAuto is on, mirroring map.js's own layout computed for the
    // old engine.
    if (titleAuto()) {
      setCurrentTitle(loadedRoot.name);
    }
    if (dirtyArmed) {
      bumpDirty();
    } else {
      dirtyArmed = true;
    }
  });

  return (
    <svg
      ref={svgRef}
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
          // No wrapping <g> here: map.css's `svg > .item > foreignObject
          // > .content` rule (root-only bold/140% font-size) requires
          // the root's own <g class="item"> to be a direct child of
          // <svg>, matching the old engine's map.js (`this.node.append
          // (root.dom.node, ...)`).
          //
          // No transform on the root itself either -- matching the old
          // engine, where root.dom.node never gets a `position` (only
          // its children do, via layoutChildren()) and on-screen
          // placement is handled entirely by the <svg>'s own style.left/
          // top (see newViewport.js's moveTo()). An earlier version
          // passed a fixed "translate(40,40)" here as a stand-in initial
          // screen offset, but that baked an offset into the exported
          // SVG's own content coordinates (serializeCurrentMap() clones
          // this tree as-is), throwing off saved-map thumbnails relative
          // to the old engine's output, which always starts content at
          // (0,0) local to the <svg>.
          <ItemNodeView item={loadedRoot()} domRefs={domRefs} />
        )}
      </Show>
    </svg>
  );
}
