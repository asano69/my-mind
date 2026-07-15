import * as app from "../my-mind.js";
const EXPORT_PADDING = 24;

/**
 * Serialize the current map to a padded SVG string (root CSS custom
 * properties embedded so the snapshot renders correctly outside the app,
 * e.g. on the catalog page), along with its final width/height.
 */
export function serializeCurrentMap() {
  const serializer = new XMLSerializer();
  // Clone so we can mutate freely without affecting the live map
  const svgNode = app.currentMap.node.cloneNode(true);
  // Embed CSS custom properties
  injectRootVariables(svgNode);
  const p = EXPORT_PADDING;
  // Get the original SVG dimensions before adding padding.
  const width = svgNode.width.baseVal.value || svgNode.viewBox.baseVal.width;
  const height = svgNode.height.baseVal.value || svgNode.viewBox.baseVal.height;
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
  const varNames = [
    "--node-shadow",
    "--node-shadow-hover",
    "--node-shadow-current",
    "--node-bg-current",
    "--node-border-width",
    "--underline-hover-outline",
    "--underline-hover-bg",
    "--toggle-color",
    "--status-yes-color",
    "--status-no-color",
    "--shadow-card",
    "--color-bg",
    "--color-pane",
    "--color-pane-hover",
    "--color-accent",
    "--color-text",
    "--color-hover",
    "--font-sans",
    "--font-serif",
    "--font-mono",
  ];
  const declarations = varNames
    .map((name) => `${name}: ${rootStyle.getPropertyValue(name).trim()}`)
    .filter((decl) => !decl.endsWith(": ")) // exclude unset variables
    .join("; ");
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
