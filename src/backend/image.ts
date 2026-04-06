// src/backend/image.ts
import Backend from "./backend.js";
import * as app from "../my-mind.js";


export type Format = "svg" | "png";

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
				let canvas = document.createElement("canvas");
				canvas.width = img.width;
				canvas.height = img.height;
				const ctx = canvas.getContext("2d")!;
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

	download(href: string) {
		let link = document.createElement("a");
		link.download = app.currentMap.name;
		link.href = href;
		link.click();
	}
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

