// src/backend/image.ts
import Backend from "./backend.js";
import * as app from "../my-mind.js";


export type Format = "svg" | "png";

// Extra space added around the exported PNG so that node box-shadows
// are not clipped at the edges of the image.
const EXPORT_PADDING = 24;

export default class ImageBackend extends Backend {
	constructor() { super("image"); }

	async save(format: Format): Promise<string> {
		const serializer = new XMLSerializer();
		const encoder = new TextEncoder();

		// Clone so we can mutate freely without affecting the live map
		const svgNode = app.currentMap.node.cloneNode(true) as SVGSVGElement;

		// Embed the page-level CSS custom properties into the SVG's style element.
		// When the SVG is rendered as an isolated image (data URI / canvas), it has
		// no access to the HTML document's :root variables, which causes rules like
		// `box-shadow: var(--node-shadow), …` to become invalid and drop entirely.
		// Injecting the resolved values as a :root block fixes that.
		injectRootVariables(svgNode);

		let xmlStr = serializer.serializeToString(svgNode);
		let encoded = encoder.encode(xmlStr);
		let byteString = [...encoded].map(byte => String.fromCharCode(byte)).join("");
		let base64 = btoa(byteString);
		let svgUrl = `data:image/svg+xml;base64,${base64}`;

		switch (format) {
			case "svg": return svgUrl;

			case "png": {
				let img = await waitForImageLoad(svgUrl);
				const p = EXPORT_PADDING;
				let canvas = document.createElement("canvas");
				canvas.width  = img.width  + p * 2;
				canvas.height = img.height + p * 2;
				const ctx = canvas.getContext("2d")!;

				// Paint #f5ede4 behind selected nodes before drawing the SVG.
				// On the page the semi-transparent color-mix() background lets the
				// warm page background show through.  On a transparent canvas the same
				// transparency would composite as black.  By filling the exact bounding
				// rect of each selected .content element with the page background colour
				// first, then drawing the SVG on top, we replicate what the browser does
				// — selected nodes appear semi-transparent over #f5ede4, everywhere else
				// remains transparent.
				paintSelectionBackgrounds(ctx, app.currentMap.node, p);

				ctx.drawImage(img, p, p);

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

	download(href: string) {
		let link = document.createElement("a");
		link.download = app.currentMap.name;
		link.href = href;
		link.click();
	}
}

/**
 * Fill the bounding rect of each selected .content element with the page
 * background colour on the canvas, before the SVG is drawn on top.
 *
 * Coordinates are converted from page-relative (getBoundingClientRect) to
 * canvas-relative by subtracting the SVG element's own bounding rect and
 * adding the export padding offset.
 */
function paintSelectionBackgrounds(
	ctx: CanvasRenderingContext2D,
	liveSvg: SVGSVGElement,
	offset: number,
) {
	const pageBg = getComputedStyle(document.documentElement)
		.getPropertyValue("--color-bg").trim() || "#f5ede4";

	const svgRect = liveSvg.getBoundingClientRect();

	liveSvg.querySelectorAll(".current, .selected").forEach(item => {
		const content = item.querySelector<HTMLElement>(".content");
		if (!content) { return; }
		const r   = content.getBoundingClientRect();
		const x   = r.left - svgRect.left + offset;
		const y   = r.top  - svgRect.top  + offset;
		const w   = r.width;
		const h   = r.height;

		// Read the computed border-radius so the fill matches the node shape
		// exactly (4px for box, ~50% resolved to pixels for ellipse).
		const radiusStr = getComputedStyle(content).borderTopLeftRadius;
		const radius = radiusStr.endsWith("%")
			? Math.min(w, h) / 2           // 50% → full ellipse
			: parseFloat(radiusStr) || 0;  // px value

		ctx.fillStyle = pageBg;
		ctx.beginPath();
		ctx.roundRect(x, y, w, h, radius);
		ctx.fill();
	});
}

/**
 * Read all CSS custom properties defined on :root in the main document and
 * inject them as a :root block at the top of the SVG's <style> element.
 *
 * This is necessary because when an SVG is serialized to a data URI and
 * drawn onto a canvas, it runs in an isolated context where the HTML
 * document's stylesheet variables are not accessible.
 */
function injectRootVariables(svgNode: SVGSVGElement) {
	const rootStyle = getComputedStyle(document.documentElement);

	// All custom properties referenced directly or indirectly by map.css
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
		.map(name => `${name}: ${rootStyle.getPropertyValue(name).trim()}`)
		.filter(decl => !decl.endsWith(": ")) // skip variables that are not set
		.join("; ");

	const rootBlock = `:root { ${declarations} }\n`;

	const style = svgNode.querySelector("style");
	if (style) {
		style.textContent = rootBlock + (style.textContent ?? "");
	}
}

async function waitForImageLoad(src: string): Promise<HTMLImageElement> {
	let img = new Image();
	img.src = src;
	return new Promise(resolve => {
		img.onload = () => resolve(img);
	});
}
