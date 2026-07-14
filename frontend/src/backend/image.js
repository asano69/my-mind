// src/backend/image.ts
import Backend from "./backend.js";
import * as app from "../my-mind.js";
const EXPORT_PADDING = 24;
export default class ImageBackend extends Backend {
    constructor() { super("image"); }
    async save(format) {
        const serializer = new XMLSerializer();
        const encoder = new TextEncoder();
        // Clone so we can mutate freely without affecting the live map
        const svgNode = app.currentMap.node.cloneNode(true);
        // CSSカスタムプロパティを埋め込む
        injectRootVariables(svgNode);
        const p = EXPORT_PADDING;
        // Get the original SVG dimensions before adding padding.
        const width = svgNode.width.baseVal.value || svgNode.viewBox.baseVal.width;
        const height = svgNode.height.baseVal.value || svgNode.viewBox.baseVal.height;
        // Expand the viewBox unconditionally so that drop shadows (which extend
        // beyond the node bounds) are not clipped in either SVG or PNG output.
        svgNode.setAttribute("width", (width + p * 2).toString());
        svgNode.setAttribute("height", (height + p * 2).toString());
        svgNode.setAttribute("viewBox", `${-p} ${-p} ${width + p * 2} ${height + p * 2}`);
        let xmlStr = serializer.serializeToString(svgNode);
        let encoded = encoder.encode(xmlStr);
        let byteString = [...encoded].map(byte => String.fromCharCode(byte)).join("");
        let base64 = btoa(byteString);
        let svgUrl = `data:image/svg+xml;base64,${base64}`;
        switch (format) {
            case "svg":
                return svgUrl;
            case "png": {
                let img = await waitForImageLoad(svgUrl);
                const canvas = document.createElement("canvas");
                canvas.width = width + p * 2;
                canvas.height = height + p * 2;
                const ctx = canvas.getContext("2d");
                // The SVG already contains the padding via its expanded viewBox,
                // so draw it at the origin without an additional offset.
                ctx.drawImage(img, 0, 0);
                return new Promise((resolve, reject) => {
                    canvas.toBlob(blob => {
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
 * :rootに定義されたCSSカスタムプロパティをSVGの<style>に埋め込む
 */
function injectRootVariables(svgNode) {
    var _a;
    const rootStyle = getComputedStyle(document.documentElement);
    const varNames = [
        "--node-shadow", "--node-shadow-hover", "--node-shadow-current",
        "--node-bg-current", "--node-border-width", "--underline-hover-outline",
        "--underline-hover-bg", "--toggle-color", "--status-yes-color",
        "--status-no-color", "--shadow-card", "--color-bg", "--color-pane",
        "--color-pane-hover", "--color-accent", "--color-text", "--color-hover",
        "--font-sans", "--font-serif", "--font-mono",
    ];
    const declarations = varNames
        .map(name => `${name}: ${rootStyle.getPropertyValue(name).trim()}`)
        .filter(decl => !decl.endsWith(": ")) // 未設定は除外
        .join("; ");
    const rootBlock = `:root { ${declarations} }\n`;
    const style = svgNode.querySelector("style");
    if (style) {
        style.textContent = rootBlock + ((_a = style.textContent) !== null && _a !== void 0 ? _a : "");
    }
}
/**
 * 画像ロードを待つ
 */
async function waitForImageLoad(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = src;
    });
}
