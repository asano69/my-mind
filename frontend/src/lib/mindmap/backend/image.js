import * as app from "../my-mind.js";
const EXPORT_PADDING = 24;

/**
 * Serialize the current map to a padded SVG string (root CSS custom
 * properties embedded so the snapshot renders correctly outside the app,
 * e.g. on the catalog page), along with its final width/height.
 */
export function serializeCurrentMap(rootSvgNode = app.currentMap.node) {
  const serializer = new XMLSerializer();
  // Clone so we can mutate freely without affecting the live map. The live
  // canvas may be browser-zoomed with CSS transform; exports intentionally use
  // the underlying 100% layout because zoom is only viewport state.
  // rootSvgNode defaults to the old engine's live map node, but callers
  // (e.g. newIo.js, for the ?newEngine=1 preview) can pass any other SVG
  // root instead -- this function only clones/reads it, never assumes
  // which engine produced it.
  const svgNode = rootSvgNode.cloneNode(true);
  svgNode.style.transform = "";
  svgNode.style.transformOrigin = "";
  // Notes indicator badges (the paperclip icon, see item.js's dom.notes)
  // must never appear in exported images, regardless of whether a node
  // actually has notes. Their visibility normally relies on the "hidden"
  // DOM attribute plus the browser's default "[hidden] { display: none }"
  // UA stylesheet rule -- but that default rule isn't reliably applied
  // once this SVG is serialized and rendered standalone (e.g. via an
  // <img> tag, see waitForImageLoad() below), which is why every node's
  // clip icon was showing up in exports. Hide them explicitly instead of
  // depending on that browser default.
  svgNode.querySelectorAll(".notes").forEach((el) => {
    el.style.display = "none";
  });
  // The link-open icon is an interactive affordance, not part of the
  // static rendered mind map -- hide it in exported/serialized SVGs the
  // same way the notes badge above is hidden.
  svgNode.querySelectorAll(".link-icon").forEach((el) => {
    el.style.display = "none";
  });
  // Embed CSS custom properties
  injectRootVariables(svgNode);
  const p = EXPORT_PADDING;
  // Get the original SVG dimensions before adding padding. Read the
  // attributes directly rather than via width.baseVal/viewBox.baseVal:
  // viewBox is never actually set on this node (see map.js), and
  // viewBox.baseVal can be null for a detached/cloned SVG element (this
  // node is cloned just above) before its first layout/paint, which
  // crashed here for a map saved immediately after creation.
  const width = parseFloat(svgNode.getAttribute("width")) || 0;
  const height = parseFloat(svgNode.getAttribute("height")) || 0;
  // Expand the viewBox unconditionally so that drop shadows (which extend
  // beyond the node bounds) are not clipped in either SVG or PNG output.
  const paddedWidth = width + p * 2;
  const paddedHeight = height + p * 2;
  svgNode.setAttribute("width", paddedWidth.toString());
  svgNode.setAttribute("height", paddedHeight.toString());
  svgNode.setAttribute("viewBox", `${-p} ${-p} ${paddedWidth} ${paddedHeight}`);
  return {
    xml: serializer.serializeToString(svgNode),
    width: paddedWidth,
    height: paddedHeight,
  };
}

export default class ImageBackend {
  async save(format) {
    const encoder = new TextEncoder();
    const { xml, width, height } = serializeCurrentMap();
    let encoded = encoder.encode(xml);
    let byteString = [...encoded]
      .map((byte) => String.fromCharCode(byte))
      .join("");
    let base64 = btoa(byteString);
    let svgUrl = `data:image/svg+xml;base64,${base64}`;
    switch (format) {
      case "svg":
        return svgUrl;
      case "png": {
        let img = await waitForImageLoad(svgUrl);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        // The SVG already contains the padding via its expanded viewBox,
        // so draw it at the origin without an additional offset.
        ctx.drawImage(img, 0, 0);
        return new Promise((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error("Failed to create PNG blob"));
              return;
            }
            resolve(URL.createObjectURL(blob));
          }, "image/png");
        });
      }
    }
  }
  download(href) {
    let link = document.createElement("a");
    link.download = app.currentMap.name;
    link.href = href;
    link.click();
  }
}

/**
 * Embed :root CSS custom properties into the SVG's <style> element, so
 * the exported SVG renders correctly even without theme.css loaded.
 */
function injectRootVariables(svgNode) {
  var _a;
  const rootStyle = getComputedStyle(document.documentElement);
  // Font tokens are not color-scheme dependent, so it's safe (and keeps
  // this in sync automatically) to read their computed values.
  const fontVarNames = ["--font-sans", "--font-serif", "--font-mono"];
  const fontDeclarations = fontVarNames
    .map((name) => `${name}: ${rootStyle.getPropertyValue(name).trim()}`)
    .filter((decl) => !decl.endsWith(": ")); // exclude unset variables

  // Color tokens must NOT be read via getComputedStyle(): style.css
  // defines them with light-dark(...), and getComputedStyle() returns
  // the value already resolved to whichever branch was active in the
  // exporting browser at save time. Baking a single resolved color here
  // would permanently freeze this standalone SVG (served at
  // /maps/{uuid}/svg, e.g. for catalog thumbnails) to that one scheme,
  // even after the viewer's own light/dark preference changes.
  // Duplicated from style.css's :root -- keep these two in sync.
  // color-scheme must also be declared here: a standalone SVG document
  // (e.g. rendered via <img>) has no page-level <meta name="color-scheme">
  // to inherit from, and light-dark() only switches branches once its
  // containing document declares support for both.
  const colorDeclarations = [
    "color-scheme: light dark",
    "--color-bg: light-dark(#f5ede4, #1c1a17)",
    "--color-pane: light-dark(#ede0d4, #26221d)",
    "--color-pane-hover: light-dark(#d9c9bb, #37302a)",
    "--color-accent: light-dark(#5a4a3a, #c9b79c)",
    "--color-text: light-dark(#2c2015, #e8dfd2)",
    "--color-hover: light-dark(rgba(90, 74, 58, 0.3), rgba(201, 183, 156, 0.2))",
  ];

  const declarations = [...colorDeclarations, ...fontDeclarations].join("; ");
  const rootBlock = `:root { ${declarations} }\n`;
  const style = svgNode.querySelector("style");
  if (style) {
    style.textContent =
      rootBlock +
      ((_a = style.textContent) !== null && _a !== void 0 ? _a : "");
  }
}

/**
 * Wait for an image to load.
 */
async function waitForImageLoad(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = src;
  });
}
