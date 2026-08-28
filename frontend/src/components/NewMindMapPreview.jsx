import {
  createSignal,
  createEffect,
  For,
  Show,
  onCleanup,
  onMount,
} from "solid-js";
import ItemNode, { measureContentSize } from "mindmap-engine/itemStore.js";
import Paperclip from "lucide-solid/icons/paperclip";
import {
  itemStateClassList,
  selectItem,
} from "mindmap-engine/itemSelection.js";
import {
  handleItemClick,
  handleItemDblClick,
  handleItemLinkClick,
} from "mindmap-engine/newMouse.js";
import { registerDomRefs } from "mindmap-engine/newEdit.js";
import * as newMouse from "mindmap-engine/newMouse.js";
import * as newClipboard from "mindmap-engine/newClipboard.js";
import * as newViewport from "mindmap-engine/newViewport.js";
import {
  TOGGLE_SIZE,
  D_MINUS,
  D_PLUS,
} from "mindmap-engine/layout/constants.js";
import { repo as layoutRepo } from "mindmap-engine/layout/layout.js";
import { repo as shapeRepo } from "mindmap-engine/shape/shape.js";
import "mindmap-engine/layout/map.js";
// Named imports also run each module's own registration side effect
// (new Box()/new Ellipse()/new Underline()), so the old blank
// import "mindmap-engine/shape/box.js" style imports are no longer
// needed alongside these (see docs/08-mindmap-engine-refactor.md's
// Phase 3.7: this preview now shares the same pure style/path
// functions the real engine's shape/*.js update() methods use, instead
// of duplicating that branching here).
import { computeBoxStyle } from "mindmap-engine/shape/box.js";
import { computeEllipseStyle } from "mindmap-engine/shape/ellipse.js";
import { computeUnderlinePath } from "mindmap-engine/shape/underline.js";
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
  });
  onCleanup(() => {
    unregisterDomRef(props.domRefs, props.item);
  });

  // Remeasures the content box whenever anything that can change its
  // rendered size changes -- mirrors the old engine's explicit
  // _bumpContentVersion() calls in item.js's updateText()/updateIcon()/
  // updateLink() (text, icon, and link-icon presence all affect the box),
  // plus resolvedShape (box/ellipse/underline swap padding and border via
  // map.css) and value/status/notes (each toggles a sibling span/badge in
  // .content, see the JSX below). Reading offsetWidth/offsetHeight forces
  // the browser to resolve layout on demand, so this always reflects the
  // DOM state Solid just committed -- no async ResizeObserver callback
  // needed, and no risk of a stale measurement surviving into the next
  // layout pass (the bug this replaces: a shape change committing new
  // CSS padding/border before a lagging ResizeObserver callback caught
  // up, producing stray gaps or overlap with neighboring nodes).
  //
  // Font-loading-driven size changes (FOUT/FOIT) are not covered here,
  // same as the old engine -- item.js never guarded against that either,
  // so this is not a new gap relative to prior behavior.
  createEffect(() => {
    const item = props.item;
    // Track every content-affecting signal explicitly.
    item.resolvedShape;
    item.text;
    item.icon;
    item.url;
    item.value;
    item.resolvedValue;
    item.resolvedStatus;
    item.notes;
    if (!contentRef) {
      return;
    }
    item.setMeasuredSize(
      measureContentSize(contentRef, item.defaultContentSize()),
    );
  });
  // Shape changes (ellipse -> underline, box -> ellipse, ...) swap which
  // map.css rule applies to ".content" (padding/border differ per
  // shape), changing the rendered content box the moment this render's
  // data-shape/style writes below commit. ResizeObserver alone is not
  // enough here: its callback is asynchronous, so contentSize (and thus
  // foreignObject/connector geometry) can stay stale for a visible
  // frame -- extra blank space or overlap with a neighboring node. The
  // old engine avoids this entirely by remeasuring synchronously right
  // after applying shape-affecting styles, inside the same layout pass
  // (see item.js's _applyOwnStyle()/_measureOwnContent()). Reading
  // resolvedShape here is a tracked signal read, so this effect reruns
  // synchronously right after Solid commits a shape-driven DOM change;
  // reading offsetWidth/offsetHeight forces the browser to resolve
  // layout on demand, so the remeasure is never stale.
  createEffect(() => {
    props.item.resolvedShape; // track shape changes
    if (!contentRef) {
      return;
    }
    const item = props.item;
    const measured = measureContentSize(contentRef, item.defaultContentSize());
    item.setMeasuredSize(measured);
  });
  onCleanup(() => {
    unregisterDomRef(props.domRefs, props.item);
  });

  return (
    <g
      class="item"
      classList={{
        ...itemStateClassList(props.item),
        // Mirrors map.css's `.item:not(.current):not(.collapsed) > .toggle`
        // rule, which expects a "collapsed" class on the item itself so the
        // +/- toggle stays visible permanently while collapsed, not just
        // while the node happens to also be selected (current).
        collapsed: props.item.collapsed,
      }}
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
                // pathInfo.stroke only exists for root's own connectors
                // (each branch keeps its own child's color, see
                // layout/map.js's computeRootConnectors). For every
                // other (non-root) connector, color comes from reading
                // props.item.resolvedColor directly in this JSX
                // binding -- a fine-grained reactive read independent
                // of the layout() memo above, so a color-only change
                // never has to recompute this item's layout geometry.
                stroke={pathInfo.stroke ?? props.item.resolvedColor}
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
      <foreignObject
        x={box()[0]}
        y={box()[1]}
        width={box()[2]}
        height={box()[3]}
      >
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
          {}
          <div
            class="text"
            style={textStyleFor(props.item)}
            innerHTML={props.item.text}
          />
          {/* Link indicator: a plain emoji instead of a custom SVG
              glyph, appended as its own sibling span (same placement as
              .value/.status/.icon above) rather than embedded in the
              text itself. See newMouse.js's handleItemLinkClick for the
              click behavior it shares with the old engine. */}
          <Show when={props.item.url}>
            <span
              class="link-icon"
              onClick={() => handleItemLinkClick(props.item)}
            >
              🔗
            </span>
          </Show>
          <Show when={hasNotes(props.item)}>
            <div class="notes" aria-label="Has notes">
              {/* style.css's global `svg { position: absolute }` rule
                  (see Logo.jsx/CatalogList.jsx's Pin icon for the same
                  fix) would otherwise pull this icon out of the
                  ".notes" flex container's normal flow. */}
              <Paperclip style={{ position: "static" }} />
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

// Creates a fresh, empty map: just a root node labeled with `title`
// (today's date, see Workspace.jsx's uuid-less case). No demo children --
// those were only ever meant for local development and were leaking into
// every real new map.
export function createPreviewRoot(title) {
  const root = new ItemNode();
  root.text = title;
  root.layout = layoutRepo.get("map");
  root.shape = shapeRepo.get("ellipse");
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
  // root is computed synchronously from props.initialData -- the host
  // (MindMapCanvas.jsx) fetches the map record via backend/pocketbase.js's
  // loadByUuid() *before* this component ever mounts, so this renderer
  // never touches the persistence layer directly (see
  // docs/mind-map-core-engine-library/01-plan.md's Step 4a). A uuid-less
  // map (a brand-new, unsaved one) always gets a fresh root instead.
  const root = props.uuid
    ? (rootFromMapData(props.initialData) ?? createPreviewRoot(props.title))
    : createPreviewRoot(props.title);

  // Local, per-instance state (not a shared store.js signal, see
  // docs/mind-map-core-engine-library/01-plan.md's Step 4e) holding a
  // root that should override the loaded root -- set via restoreRoot()
  // below, exposed to the host as part of this engine instance's own
  // public API instead of a bridge signal the host writes to directly.
  // Takes priority over the loaded root, mirroring the old engine's
  // restoreSnapshot() replacing app.currentMap's root without touching
  // the map's saved identity. Every other read of "the current root" in
  // this component goes through effectiveRoot() below instead of root
  // directly, so a restored root is picked up everywhere (viewport,
  // mouse, the layout effect, and the render itself).
  const [overrideRoot, setOverrideRoot] = createSignal(null);

  // Public engine API for this mounted instance -- currently just
  // restoreRoot(), the explicit method
  // docs/mind-map-core-engine-library/01-plan.md's own table calls for
  // in place of the old overrideRoot/setOverrideRoot store.js signal.
  // Handed to the host once on mount (see onMount below) so callers
  // like ui/io.js's restoreSnapshot() can invoke it without this
  // component importing store.js at all.
  function restoreRoot(newRoot) {
    setOverrideRoot(newRoot);
  }

  const effectiveRoot = () => overrideRoot() ?? root;

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
    // overrideRoot is now local component state (see its own comment
    // above), so it already resets itself just by this component
    // remounting -- this call only guards against a same-mount reset
    // being relied upon elsewhere.
    setOverrideRoot(null);
    // Hands this instance's public engine API to the host -- see
    // restoreRoot()'s own comment above.
    props.onEngineReady?.({ restoreRoot });
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
    newMouse.init(domRefs, port, port, () => effectiveRoot());
    // Registers this preview as the source the "center map" command
    // (see newContextMenuCommands.js) reads from -- see newViewport.js's
    // registerCenterSource() for why this indirection is needed.
    newViewport.registerCenterSource(
      () => effectiveRoot()?.size,
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
    // auto-save preference. Routed through a host callback instead of
    // importing ui/io.js directly -- see docs/mind-map-core-engine-library/
    // 01-plan.md's Step 4b -- so this renderer stays free of any
    // persistence-layer dependency. MindMapCanvas.jsx supplies the
    // actual io.init() call.
    props.onMount?.();
  });
  onCleanup(() => {
    newMouse.dispose();
    newClipboard.dispose();
    newViewport.dispose();
    // See onMount's own comment above: routed through a host callback
    // (MindMapCanvas.jsx calls io.dispose()/io.detach()) instead of
    // importing ui/io.js directly.
    props.onUnmount?.();
    setOverrideRoot(null);
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
    const loadedRoot = effectiveRoot();
    if (!loadedRoot || !svgRef) {
      return;
    }
    if (loadedRoot !== lastRootSeen) {
      lastRootSeen = loadedRoot;
      centered = false;
      dirtyArmed = false;
      newViewport.resetAnchor();
      // Select the root on load, mirroring the old engine's map.js
      // show() -> app.selectItem(this._root) call. Without this, a
      // freshly opened/switched map has no current selection at all
      // under the new engine.
      selectItem(loadedRoot);
      // Registers this root/svg as the source ui/io.js's save/autosave
      // logic reads from, via a host callback rather than importing
      // ui/io.js directly (see docs/mind-map-core-engine-library/
      // 01-plan.md's Step 4b). props.mapRecord is the record
      // MindMapCanvas.jsx already fetched before mounting this
      // component (see this file's own header comment on `root`) --
      // only non-null when a real saved map was actually loaded, so
      // MindMapCanvas.jsx only runs its own io.setCurrentMap()
      // bookkeeping (which rewrites the URL) in that case, matching the
      // old engine's io.restore(), which only did the same when a
      // record was actually found.
      const loadedRecord = props.uuid ? props.mapRecord : null;
      props.onRootReady?.(loadedRoot, svgRef, loadedRecord);
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
    // Reports the root node's current label to the host on every layout
    // pass, mirroring map.js's own layout computed for the old engine.
    // Routed through a host callback instead of importing store.js's
    // titleAuto/setCurrentTitle directly -- see
    // docs/mind-map-core-engine-library/01-plan.md's Step 4d -- so this
    // renderer stays free of any app-state dependency. Whether this
    // actually updates the displayed title (i.e. whether titleAuto is
    // on) is entirely the host's decision now; this call just reports
    // the current name unconditionally, every pass.
    props.onTitleChange?.(loadedRoot.name);
    // Routed through a host callback instead of importing store.js's
    // bumpDirty directly -- see docs/mind-map-core-engine-library/
    // 01-plan.md's Step 4c -- so this renderer stays free of any
    // app-state dependency. MindMapCanvas.jsx supplies the actual
    // bumpDirty() call.
    if (dirtyArmed) {
      props.onDirty?.();
    } else {
      dirtyArmed = true;
    }
  });

  return (
    <>
      <svg
        ref={svgRef}
        data-engine="solid-item-node-preview"
        width="640"
        height="240"
        style={{ "font-size": "15px", left: "40px", top: "40px" }}
      >
        <style>{mapCss}</style>
        <Show when={effectiveRoot()}>
          {
            // children-as-function is the standard idiomatic Solid API
            // for narrowing a signal to a non-null value inside this
            // block; it is a render prop, not a signal read escaping its
            // tracked scope.
            (loadedRoot) => (
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
            )
          }
        </Show>
      </svg>
    </>
  );
}
