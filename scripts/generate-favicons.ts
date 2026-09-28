#!/usr/bin/env -S npx tsx
/**
 * Regenerates every favicon in static/ from the landing page itself: a "B" in
 * Muddy Tractor on the page's rust wash, run through the page's halftone and
 * grain.
 *
 *   npm run favicons
 *
 * Nothing here restates the look. The letter and the wash are drawn by
 * Chromium from src/lib/theme.css — the letter is an `h1`, so it takes the
 * landing title's face and amber from the theme's own `:where(h1)` rule — and
 * the filter is the CPU reference model the page's shaders are generated from
 * and tested against (`src/lib/halftone.ts`, `src/lib/grain.ts`), with the
 * landing page's parameters. Change the theme or the effects and a re-run
 * follows them; only the parameters below are copied, from
 * src/routes/(public)/+page.svelte, and need keeping in step by hand.
 *
 * Every size is rendered natively rather than downscaled from one master.
 * The screen is a line pattern, and a 512 px master shrunk to 16 px averages
 * its lines away into a flat tint; rendered at 16 px it is still a screen.
 *
 * PNGs are decoded and encoded by the same Chromium, through a canvas, so the
 * script needs nothing Playwright does not already bring.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { type Browser, chromium, type Page } from 'playwright';
import { applyGrain, grainOrigin } from '../src/lib/grain.ts';
import {
	halftoneCoordAlong,
	renderHalftoneScreenValue,
	rgbToLuma,
	softLightGrayOnRgb
} from '../src/lib/halftone.ts';

const ROOT = new URL('../', import.meta.url);
const STATIC = new URL('static/', ROOT);

/** Never resolved: every request to it is answered by `page.route`. */
const ORIGIN = 'http://favicon.invalid';

/**
 * The icon is a tile of the landing page this many CSS px square, scaled to
 * each output size. It sets how much of the screen fits across the icon —
 * 64 / 8 px cells is eight lines — and so how coarse it reads.
 */
const TILE = 64;

/** The landing page's chain: `mix(HalftoneLines, …)`, then `Grain`. */
const HALFTONE = { angleDegrees: 15, contrast: 0.4, cellSize: 8, opacity: 0.4 };
const GRAIN_STRENGTH = 1.3;
/** Soft-light's identity, as `SOFT_LIGHT_NEUTRAL` in $lib/effects/mix. */
const NEUTRAL = 0.5;

type Icon = {
	size: number;
	/** The letter's cap height, as a fraction of the icon. */
	letter: number;
};

/**
 * Browser tab icons fill the tile. The manifest's icons are `maskable`, and a
 * platform may crop those to a circle 80% of the icon across, so their letter
 * is small enough for its whole box to sit inside that circle.
 */
const FAVICON: Omit<Icon, 'size'> = { letter: 0.72 };
const MASKABLE: Omit<Icon, 'size'> = { letter: 0.5 };

const PNGS: Record<string, Icon> = {
	'favicon-96x96.png': { size: 96, ...FAVICON },
	'apple-touch-icon.png': { size: 180, ...FAVICON },
	'web-app-manifest-192x192.png': { size: 192, ...MASKABLE },
	'web-app-manifest-512x512.png': { size: 512, ...MASKABLE }
};
/** The sizes Windows and old browsers pick between in favicon.ico. */
const ICO_SIZES = [16, 32, 48];

// `--page-texture: none` as on the landing page: the CSS texture is the
// stand-in for the effects applied below, and drawing both doubles the grain.
// `text-box` trims the h1 to its cap height and baseline, so centring it
// centres the ink rather than the font's line box, whose ascender and
// descender room would push the letter off-centre.
const HTML = `<!doctype html>
<html class="wa-dark">
	<head>
		<meta charset="utf-8" />
		<link rel="stylesheet" href="/theme.css" />
		<style>
			:root { --page-texture: none; }
			html, body { margin: 0; height: 100%; }
			body { display: grid; place-items: center; }
			h1 { margin: 0; line-height: 1; text-box: trim-both cap alphabetic; }
		</style>
	</head>
	<body><h1>B</h1></body>
</html>`;

const FILES: Record<string, { path: URL; type: string }> = {
	'/theme.css': { path: new URL('src/lib/theme.css', ROOT), type: 'text/css' },
	'/fonts/muddy-tractor.woff2': {
		path: new URL('fonts/muddy-tractor.woff2', STATIC),
		type: 'font/woff2'
	},
	'/fonts/rethink-sans-latin.woff2': {
		path: new URL('fonts/rethink-sans-latin.woff2', STATIC),
		type: 'font/woff2'
	}
};

async function servePage(page: Page): Promise<void> {
	await page.route(`${ORIGIN}/**`, async (route) => {
		const { pathname } = new URL(route.request().url());
		if (pathname === '/') {
			await route.fulfill({ contentType: 'text/html', body: HTML });
			return;
		}
		const file = FILES[pathname];
		if (!file) {
			await route.fulfill({ status: 404 });
			return;
		}
		await route.fulfill({ contentType: file.type, body: await readFile(file.path) });
	});
	await page.goto(`${ORIGIN}/`);
	// A screenshot taken before the face arrives shows the fallback face.
	await page.evaluate(async () => {
		await document.fonts.load('1em "Muddy Tractor"');
		await document.fonts.ready;
	});
}

/** The letter and wash, as Chromium draws them, in RGBA 0..255. */
async function capture(page: Page, icon: Icon): Promise<Uint8ClampedArray> {
	await page.setViewportSize({ width: TILE, height: TILE });
	// Sized by the trimmed box, so `letter` is the cap height whatever the
	// face's own proportions of cap height to em are.
	await page.evaluate((capHeight) => {
		const title = document.querySelector('h1');
		if (!title) {
			throw new Error('The favicon page has no h1');
		}
		title.style.fontSize = '100px';
		const perPx = title.getBoundingClientRect().height / 100;
		title.style.fontSize = `${capHeight / perPx}px`;
	}, icon.letter * TILE);
	const png = await page.screenshot({ type: 'png' });
	const pixels = await page.evaluate(async (base64) => {
		const response = await fetch(`data:image/png;base64,${base64}`);
		const bitmap = await createImageBitmap(await response.blob());
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('No 2D canvas context to decode the screenshot with');
		}
		context.drawImage(bitmap, 0, 0);
		return Array.from(context.getImageData(0, 0, bitmap.width, bitmap.height).data);
	}, png.toString('base64'));
	if (pixels.length !== icon.size * icon.size * 4) {
		throw new Error(
			`Captured ${pixels.length / 4} px for a ${icon.size} px icon: the tile and the device scale factor disagree`
		);
	}
	return Uint8ClampedArray.from(pixels);
}

/**
 * The landing page's chain, per pixel: the screen, mixed toward grey at the
 * halftone's opacity, then the grain, soft-lit over the capture. The page's
 * halftone fade starts 300 px down, below anything a tile shows, so it is
 * left out.
 *
 * Distances are in CSS px scaled to the icon, as they are on the page; the
 * grain is per output pixel, since it is texture rather than a feature and
 * scaled up it turns into blocks.
 */
function applyEffects(rgba: Uint8ClampedArray, size: number): Uint8ClampedArray {
	const scale = size / TILE;
	const angle = (HALFTONE.angleDegrees * Math.PI) / 180;
	const origin = grainOrigin(size, size);
	const out = new Uint8ClampedArray(rgba.length);
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const index = (y * size + x) * 4;
			const red = rgba[index] / 255;
			const green = rgba[index + 1] / 255;
			const blue = rgba[index + 2] / 255;
			const along = halftoneCoordAlong('line', x + 0.5, y + 0.5, angle, size / 2, size / 2);
			const screen = renderHalftoneScreenValue(
				rgbToLuma(red, green, blue),
				along,
				HALFTONE.cellSize * scale,
				HALFTONE.contrast
			);
			const mixed = NEUTRAL + (screen - NEUTRAL) * HALFTONE.opacity;
			const layer = applyGrain(mixed, x + 0.5 - origin.x, y + 0.5 - origin.y, GRAIN_STRENGTH);
			const blended = softLightGrayOnRgb(red, green, blue, layer);
			out[index] = Math.round(blended[0] * 255);
			out[index + 1] = Math.round(blended[1] * 255);
			out[index + 2] = Math.round(blended[2] * 255);
			out[index + 3] = 255;
		}
	}
	return out;
}

async function encodePng(page: Page, rgba: Uint8ClampedArray, size: number): Promise<Buffer> {
	const base64 = await page.evaluate(
		async ({ pixels, side }) => {
			const canvas = new OffscreenCanvas(side, side);
			const context = canvas.getContext('2d');
			if (!context) {
				throw new Error('No 2D canvas context to encode the icon with');
			}
			context.putImageData(new ImageData(Uint8ClampedArray.from(pixels), side, side), 0, 0);
			const blob = await canvas.convertToBlob({ type: 'image/png' });
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let binary = '';
			for (const byte of bytes) {
				binary += String.fromCharCode(byte);
			}
			return btoa(binary);
		},
		{ pixels: Array.from(rgba), side: size }
	);
	return Buffer.from(base64, 'base64');
}

/**
 * An ICO holding PNG images, which every browser that reads favicon.ico at all
 * accepts. Layout: a 6-byte header, a 16-byte entry per image, then the PNGs.
 */
function encodeIco(images: { size: number; png: Buffer }[]): Buffer {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2); // 1 = icon
	header.writeUInt16LE(images.length, 4);
	let offset = header.length + 16 * images.length;
	const entries = images.map(({ size, png }) => {
		const entry = Buffer.alloc(16);
		entry.writeUInt8(size % 256, 0); // 0 means 256
		entry.writeUInt8(size % 256, 1);
		entry.writeUInt16LE(1, 4); // colour planes
		entry.writeUInt16LE(32, 6); // bits per pixel
		entry.writeUInt32LE(png.length, 8);
		entry.writeUInt32LE(offset, 12);
		offset += png.length;
		return entry;
	});
	return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

async function render(chrome: Browser, icon: Icon): Promise<Buffer> {
	// The device scale factor is what gives each size its own render; it is
	// fixed per context, so each icon gets one.
	const context = await chrome.newContext({ deviceScaleFactor: icon.size / TILE });
	try {
		const page = await context.newPage();
		await servePage(page);
		const captured = await capture(page, icon);
		return await encodePng(page, applyEffects(captured, icon.size), icon.size);
	} finally {
		await context.close();
	}
}

const browser = await chromium.launch();
try {
	for (const [name, icon] of Object.entries(PNGS)) {
		await writeFile(new URL(name, STATIC), await render(browser, icon));
		console.info(`wrote static/${name}`);
	}
	const icoImages = await Promise.all(
		ICO_SIZES.map(async (size) => ({ size, png: await render(browser, { size, ...FAVICON }) }))
	);
	await writeFile(new URL('favicon.ico', STATIC), encodeIco(icoImages));
	console.info('wrote static/favicon.ico');
} finally {
	await browser.close();
}
