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

		if (format === "png") {
			// The selection highlight uses color-mix() whose percentages sum to less
			// than 100%, leaving a transparent remainder.  On the page the warm
			// background colour shows through correctly; on a transparent canvas the
			// transparent fraction composites as black, making nodes look dark.
			// Fix: sample the computed background-color of each live selected element,
			// blend it with the page background to produce a fully opaque equivalent,
			// then inject that as an inline style override on the cloned element.
			fixSelectionOpacity(app.currentMap.node, svgNode);
		}

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
 * For each .current / .selected item, read the computed background-color of
 * the live .content element (where color-mix() is already resolved by the
 * browser to an rgba value), blend it with the page background to make it
 * fully opaque, then write that colour as an inline style override on the
 * corresponding element in the cloned SVG.
 *
 * The radial gloss gradient is re-applied on top so the visual appearance
 * matches the live map as closely as possible.
 */
function fixSelectionOpacity(liveSvg: SVGSVGElement, clonedSvg: SVGSVGElement) {
	const pageBgHex = getComputedStyle(document.documentElement)
		.getPropertyValue("--color-bg").trim() || "#f5ede4";
	const pageBg = parseHexColor(pageBgHex);
	if (!pageBg) { return; }

	const liveItems   = Array.from(liveSvg.querySelectorAll(".current, .selected"));
	const clonedItems = Array.from(clonedSvg.querySelectorAll(".current, .selected"));

	liveItems.forEach((liveItem, i) => {
		const liveContent   = liveItem.querySelector<HTMLElement>(".content");
		const clonedContent = clonedItems[i]?.querySelector<HTMLElement>(".content");
		if (!liveContent || !clonedContent) { return; }

		const bgStr  = getComputedStyle(liveContent).backgroundColor;
		const bgRgba = parseRgbaColor(bgStr);
		if (!bgRgba || bgRgba.a >= 1) { return; } // already opaque — nothing to do

		// Alpha-composite the semi-transparent selection colour over the page background.
		const a = bgRgba.a;
		const opaque = {
			r: Math.round(bgRgba.r * a + pageBg.r * (1 - a)),
			g: Math.round(bgRgba.g * a + pageBg.g * (1 - a)),
			b: Math.round(bgRgba.b * a + pageBg.b * (1 - a)),
		};

		// Preserve the gloss radial gradient from map.css, replace only the base color.
		clonedContent.style.background = [
			"radial-gradient(ellipse 55% 35% at 40% 18%, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0) 100%)",
			`rgb(${opaque.r}, ${opaque.g}, ${opaque.b})`,
		].join(", ");
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

/** Parse "rgba(r, g, b, a)" or "rgb(r, g, b)" into component numbers. */
function parseRgbaColor(str: string): { r: number; g: number; b: number; a: number } | null {
	const m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
	if (!m) { return null; }
	return {
		r: parseFloat(m[1]),
		g: parseFloat(m[2]),
		b: parseFloat(m[3]),
		a: m[4] !== undefined ? parseFloat(m[4]) : 1,
	};
}

/** Parse a 3- or 6-digit hex color string into rgb components. */
function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
	const clean = hex.replace("#", "");
	if (clean.length === 3) {
		return {
			r: parseInt(clean[0] + clean[0], 16),
			g: parseInt(clean[1] + clean[1], 16),
			b: parseInt(clean[2] + clean[2], 16),
		};
	}
	if (clean.length === 6) {
		return {
			r: parseInt(clean.slice(0, 2), 16),
			g: parseInt(clean.slice(2, 4), 16),
			b: parseInt(clean.slice(4, 6), 16),
		};
	}
	return null;
}

async function waitForImageLoad(src: string): Promise<HTMLImageElement> {
	let img = new Image();
	img.src = src;
	return new Promise(resolve => {
		img.onload = () => resolve(img);
	});
}
