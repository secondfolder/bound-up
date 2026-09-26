import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';

/**
 * The landing page's effects: the page captured with SnapDOM
 * (`VfxPageSnapshot`), screened by `HalftoneLinesEffect` and grained by
 * `GrainEffect` through VFX-JS, and soft-lit back over the page.
 *
 * Tested at this level because the effect depends on SnapDOM capturing the
 * page with its real, served CSS, on WebGL, and on the browser compositing the
 * whole page — not one component in a test frame.
 *
 * The unhandled-rejection net matters here specifically: the overlay's first
 * version (on html2canvas) threw `Attempting to parse an unsupported color
 * function "oklab"` from a promise nothing awaited, so the page looked fine and only this
 * suite's pageerror watcher (see fixtures.ts) plus a pixels assertion can
 * tell a working overlay from a blank canvas.
 */

type Region = { x: number; y: number; width: number; height: number };

/**
 * The effects canvas's pixels over `region` (viewport CSS px), read in the
 * same frame as a fresh draw.
 *
 * VFX-JS creates its WebGL context without `preserveDrawingBuffer`, so the
 * buffer is cleared once the frame is presented and a read at any other time
 * sees transparent pixels. The provider redraws on scroll, in an animation
 * frame callback; one registered after it runs later in the same frame, when
 * the buffer still holds the draw. The canvas is one CSS px per pixel
 * (`pixelRatio={1}` on the page) and tracks the viewport, offset by VFX's
 * scroll padding, which its bounding box accounts for.
 */
function readEffects(page: Page, region: Region): Promise<number[]> {
	return page.evaluate(async (box) => {
		const canvas = document.querySelector<HTMLCanvasElement>('canvas.vfx-canvas');
		if (!canvas) {
			throw new Error('no effects canvas');
		}
		globalThis.dispatchEvent(new Event('scroll'));
		await new Promise(requestAnimationFrame);
		const rect = canvas.getBoundingClientRect();
		const scratch = document.createElement('canvas');
		scratch.width = box.width;
		scratch.height = box.height;
		const ctx = scratch.getContext('2d');
		if (!ctx) {
			throw new Error('no 2D context to read the effects back through');
		}
		ctx.drawImage(
			canvas,
			box.x - rect.left,
			box.y - rect.top,
			box.width,
			box.height,
			0,
			0,
			box.width,
			box.height
		);
		return Array.from(ctx.getImageData(0, 0, box.width, box.height).data);
	}, region);
}

/** Waits for the first capture to land and the effects canvas to fade in. */
async function effectsShown(page: Page) {
	await expect
		.poll(
			() => page.evaluate(() => document.querySelector<HTMLElement>('.vfx-layer')?.style.opacity),
			{ timeout: 20_000 }
		)
		.toBe('1');
}

/**
 * The value at (x, y), averaged along the screen's lines — 15° on the landing
 * page — over ±12 px. The screen is constant along a line, so its profile
 * survives, while the grain, independent from pixel to pixel, is averaged
 * down five-fold. The grain runs at full strength over a halftone at 0.4, so
 * without this the screen's extremes are lost in it.
 */
function alongLines(pixels: number[], width: number, x: number, y: number): number {
	const [dx, dy] = [Math.cos((15 * Math.PI) / 180), -Math.sin((15 * Math.PI) / 180)];
	let sum = 0;
	for (let step = -12; step <= 12; step += 1) {
		const [px, py] = [Math.round(x + step * dx), Math.round(y + step * dy)];
		sum += pixels.at((py * width + px) * 4) ?? 0;
	}
	return sum / 25 / 255;
}

/**
 * The red channel of `rgba` box-blurred over (2·radius + 1)² pixels, as RGBA
 * again. Clamped at the edges.
 */
function boxBlur(rgba: number[], width: number, height: number, radius: number): number[] {
	const out = new Array<number>(rgba.length).fill(255);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			let [sum, count] = [0, 0];
			for (let dy = -radius; dy <= radius; dy += 1) {
				for (let dx = -radius; dx <= radius; dx += 1) {
					const [px, py] = [x + dx, y + dy];
					if (px >= 0 && px < width && py >= 0 && py < height) {
						sum += rgba.at((py * width + px) * 4) ?? 0;
						count += 1;
					}
				}
			}
			out[(y * width + x) * 4] = sum / count;
		}
	}
	return out;
}

/** Pearson correlation of `a`'s red channel against `b`'s shifted by
 * (dx, dy), over the pixels both cover. */
function correlationAt(
	a: number[],
	b: number[],
	width: number,
	height: number,
	dx: number,
	dy: number
): number {
	let [n, sumA, sumB, sumAB, sumAA, sumBB] = [0, 0, 0, 0, 0, 0];
	for (let y = 4; y < height - 4; y += 1) {
		for (let x = 4; x < width - 4; x += 1) {
			const va = a.at((y * width + x) * 4) ?? 0;
			const vb = b.at(((y + dy) * width + x + dx) * 4) ?? 0;
			[n, sumA, sumB] = [n + 1, sumA + va, sumB + vb];
			[sumAB, sumAA, sumBB] = [sumAB + va * vb, sumAA + va * va, sumBB + vb * vb];
		}
	}
	const covariance = sumAB / n - (sumA / n) * (sumB / n);
	return covariance / Math.sqrt((sumAA / n - (sumA / n) ** 2) * (sumBB / n - (sumB / n) ** 2));
}

/**
 * Waits for a capture of the body at its current size, after a resize to
 * `width`. The body's height is read rather than assumed: the landing page is
 * taller than the window (its CTA's bottom margin is sized from the width), so
 * it is not the viewport's height.
 */
async function capturedAt(page: Page, width: number) {
	await expect
		.poll(
			() =>
				page.evaluate((expectedWidth) => {
					const source = document.querySelector<HTMLCanvasElement>('canvas.snapshot-source');
					if (!source) {
						return false;
					}
					// A bitmap is whole pixels; the body can be fractional.
					const body = document.body.getBoundingClientRect();
					return source.width === expectedWidth && Math.abs(source.height - body.height) < 1;
				}, width),
			{ timeout: 20_000 }
		)
		.toBe(true);
}

/**
 * Pins the page to a fixed, whole-pixel height, taller than the landing's
 * content at any width a test uses.
 *
 * The landing page's own height follows the width (the CTA's bottom margin is
 * in `vw`), and that moves two things a resize test means to hold still: the
 * page centre the grain is anchored to, and — at a fractional height — the
 * whole-pixel capture, which then sits half a pixel off the body's centre.
 */
async function pinPageHeight(page: Page) {
	await page.addStyleTag({ content: 'html body { height: 1400px; min-height: 1400px; }' });
}

test('the halftone screen and grain paint over the landing page', async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 700 });
	await page.goto('/');
	await effectsShown(page);

	const pixels = await readEffects(page, { x: 0, y: 0, width: 1000, height: 700 });

	// The calibration targets Affinity's blend-free line halftone, so the
	// canvas is an opaque grayscale screen rather than a translucent ink
	// overlay. A render that paints under most pixels but leaves the frame
	// non-opaque or coloured is the wrong algorithm, not a stylistic variant.
	let opaque = 0;
	let channelDeltaSum = 0;
	for (let index = 0; index < pixels.length; index += 4) {
		const [red = 0, green = 0, blue = 0, alpha = 0] = pixels.slice(index, index + 4);
		if (alpha >= 230) {
			opaque += 1;
		}
		channelDeltaSum += Math.abs(red - green) + Math.abs(green - blue);
	}
	expect(opaque / (pixels.length / 4)).toBeGreaterThan(0.99);
	expect(channelDeltaSum / (pixels.length / 4)).toBeLessThan(1);

	// Columns down the part of the screen at full strength, above where the
	// page starts fading it out (300px — see the landing page).
	const sampleColumn = (x: number) => {
		let [min, max] = [1, 0];
		for (let y = 12; y < 288; y += 1) {
			const value = alongLines(pixels, 1000, x, y);
			[min, max] = [Math.min(min, value), Math.max(max, value)];
		}
		return { min, max };
	};
	const left = sampleColumn(50);
	const right = sampleColumn(950);

	// At a 15 degree line angle the bands still run near-horizontally, so
	// vertical samples on both sides of the page's left-to-right gradient
	// should oscillate strongly. The bounds come from the model in
	// docs/page-effects.md: at contrast 0.4 the slope is tan(36°) = 0.727, so a
	// tone t peaks at t·1.727 and troughs below zero for anything under 0.58.
	// The background runs #943700 (tone 0.30) to #711500 (tone 0.18), which
	// predicts crests near 0.52 on the left and 0.31 on the right, both on a
	// black floor. The page mixes that screen toward grey at 0.4, which maps
	// 0..0.52 onto 0.30..0.51 and 0..0.31 onto 0.30..0.42, and the smoothed
	// grain moves each by a few hundredths. Asserting the shape rather than
	// the numbers keeps this honest through tuning.
	expect(left.min).toBeLessThan(0.35);
	expect(left.max).toBeGreaterThan(0.46);
	expect(right.min).toBeLessThan(0.35);
	expect(right.max).toBeGreaterThan(0.38);
	expect(right.max).toBeLessThan(0.48);
	expect(left.max).toBeGreaterThan(right.max + 0.03);
});

/**
 * The halftone fades out from 300px down the page; the grain runs the whole
 * page. Past the fade the screen has gone to mid-grey, soft-light's identity,
 * so what is left there is grain on grey — the page shows through untouched
 * but for the grain.
 *
 * The page is lengthened to a fixed 1400px for the test: at 1000 × 700 the
 * fade ends at 300 + 0.35 × 700 = 545px, and the landing page's own height
 * depends on the width.
 */
test('the halftone fades out down the page, and the grain carries on', async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 700 });
	await page.goto('/');
	await page.addStyleTag({ content: 'html body { min-height: 1400px; }' });
	await capturedAt(page, 1000);
	await effectsShown(page);

	const statsOf = (pixels: number[], width: number, height: number, x: number) => {
		const smoothed: number[] = [];
		for (let y = 12; y < height - 12; y += 1) {
			smoothed.push(alongLines(pixels, width, x, y));
		}
		const values = pixels.filter((_, index) => index % 4 === 0).map((value) => value / 255);
		const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
		const sd = Math.sqrt(
			values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
		);
		const smoothedMean = smoothed.reduce((sum, value) => sum + value, 0) / smoothed.length;
		const screenSd = Math.sqrt(
			smoothed.reduce((sum, value) => sum + (value - smoothedMean) ** 2, 0) / smoothed.length
		);
		return { mean, sd, values, screenSd };
	};

	// Well past the fade: the bottom of the page.
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	const scrollY = await page.evaluate(() => window.scrollY);
	// Page y 555 onwards, which is off the top of the window once scrolled.
	const top = Math.max(0, Math.ceil(545 + 10 - scrollY));
	const below = statsOf(
		await readEffects(page, { x: 300, y: top, width: 400, height: 698 - top }),
		400,
		698 - top,
		200
	);
	// Grain at strength 1.3 on 0.5: triangular over ±0.204, sd 0.083.
	expect(below.mean).toBeGreaterThan(0.47);
	expect(below.mean).toBeLessThan(0.53);
	expect(below.sd).toBeGreaterThan(0.06);
	expect(below.sd).toBeLessThan(0.11);
	expect(below.values.every((value) => value > 0.25 && value < 0.75)).toBe(true);
	// No screen left: along the lines, only the averaged-down grain varies.
	expect(below.screenSd).toBeLessThan(0.03);

	// Above the fade, the screen is there.
	await page.evaluate(() => window.scrollTo(0, 0));
	const above = statsOf(
		await readEffects(page, { x: 300, y: 0, width: 400, height: 290 }),
		400,
		290,
		200
	);
	expect(above.screenSd).toBeGreaterThan(0.04);
});

/**
 * The page draws on demand. It used to redraw every animation frame even
 * with the drift at 0, and since the canvas is soft-light blended over the
 * whole viewport that kept Firefox's GPU process near 40% CPU on a page where
 * nothing moves. Counting draw calls is the only way to see that from here —
 * the pixels are identical either way.
 */
test('the effects stop drawing once the page is still', async ({ page }) => {
	await page.addInitScript(() => {
		const counted = globalThis as unknown as { effectDraws: number };
		counted.effectDraws = 0;
		// A Proxy rather than a replacement function, so the call keeps the
		// context it was made on without the wrapper having to touch `this`.
		// WebGL2, which VFX-JS uses, and whose prototype does not inherit
		// WebGL1's.
		WebGL2RenderingContext.prototype.drawArrays = new Proxy(
			WebGL2RenderingContext.prototype.drawArrays,
			{
				apply(target, context, args) {
					counted.effectDraws += 1;
					return Reflect.apply(target, context, args);
				}
			}
		);
	});
	await page.goto('/');
	await effectsShown(page);

	// Draws made across the next 60 animation frames. A loop draws in every
	// one, so it never reads 0; on-demand drawing reads 0 once any late
	// recapture (a font arriving, say) has landed — hence poll, not sample.
	const drawsOverSixtyFrames = () =>
		page.evaluate(async () => {
			const counted = globalThis as unknown as { effectDraws: number };
			const before = counted.effectDraws;
			for (let i = 0; i < 60; i += 1) {
				await new Promise(requestAnimationFrame);
			}
			return counted.effectDraws - before;
		});
	await expect.poll(drawsOverSixtyFrames, { timeout: 10_000 }).toBe(0);
	expect(
		await page.evaluate(() => (globalThis as unknown as { effectDraws: number }).effectDraws)
	).toBeGreaterThan(0);
});

/**
 * On a viewport shorter than the page, the capture has to cover the whole
 * body at 1:1. html2canvas, the previous capture library, cropped to the
 * window unless told the size, and the cropped bitmap was stretched over the
 * body, which slid the screened subtitle visibly off the real one; before
 * that, the canvas was fixed and viewport-centred, which was off by half the
 * overflow.
 *
 * VFX-JS draws the effect wherever the snapshot's canvas is, so that canvas's
 * box is where the effect lands.
 */
test('the page snapshot covers the body 1:1 on a short viewport, and follows a resize without blanking', async ({
	page
}) => {
	// Short enough that the page overflows it: the header plus the stacked
	// CTA (the short-viewport rule) come to more than 200px.
	await page.setViewportSize({ width: 900, height: 200 });
	await page.goto('/');
	const canvas = page.locator('canvas.snapshot-source');

	const geometry = () =>
		page.evaluate(() => {
			const el = document.querySelector<HTMLCanvasElement>('canvas.snapshot-source');
			if (!el) {
				throw new Error('no snapshot canvas');
			}
			const box = el.getBoundingClientRect();
			const clip = el.parentElement?.getBoundingClientRect();
			if (!clip) {
				throw new Error('snapshot canvas has no clip');
			}
			const body = document.body.getBoundingClientRect();
			const effects = document.querySelector<HTMLElement>('.vfx-layer');
			return {
				pixels: [el.width, el.height],
				box: [box.left, box.top, box.width, box.height],
				clip: [clip.left, clip.top, clip.width, clip.height],
				// Exact, as the clip is: it follows the body's own box. A bitmap
				// is whole pixels, so the capture is this rounded one way or the
				// other.
				body: [body.left, body.top, body.width, body.height],
				effectsOpacity: effects?.style.opacity
			};
		});

	await expect
		.poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).height), { timeout: 20_000 })
		.toBeGreaterThan(200);
	let { pixels, box, body } = await geometry();
	// The canvas is the capture, centred on the body — in CSS, so a body of
	// fractional height leaves the whole-pixel canvas a sub-pixel off centre,
	// never more.
	for (const [index, size] of pixels.entries()) {
		expect(Math.abs(size - (body.at(index + 2) ?? 0)), `size ${index}`).toBeLessThan(1);
	}
	for (const [index, edge] of box.entries()) {
		expect(Math.abs(edge - (body.at(index) ?? 0)), `edge ${index}`).toBeLessThan(1);
	}

	// A drag, in steps: the effects stay up throughout (they used to hide on
	// every size change until the layout held still). The clip always covers
	// the body, and the canvas inside it keeps a captured size, 1:1 — the last
	// frame is centred until the next capture replaces it, never stretched.
	await effectsShown(page);
	for (const width of [860, 800, 740, 680, 620]) {
		await page.setViewportSize({ width, height: 300 + (900 - width) });
		expect((await geometry()).effectsOpacity).toBe('1');
		await expect.poll(async () => (await geometry()).clip).toEqual((await geometry()).body);
		({ pixels, box } = await geometry());
		expect(box.slice(2)).toEqual(pixels);
	}

	await page.setViewportSize({ width: 600, height: 700 });
	await capturedAt(page, 600);

	// Narrow enough that the title overhangs the body. Left to itself SnapDOM
	// widened the capture to take in the overhang, and a bitmap wider than the
	// clip, centred in it, put every glyph half the overhang to the left.
	await page.setViewportSize({ width: 150, height: 700 });
	const overhang = await page.evaluate(
		() => document.documentElement.scrollWidth - document.body.getBoundingClientRect().width
	);
	expect(overhang).toBeGreaterThan(0);
	await expect
		.poll(async () => {
			const current = await geometry();
			return Math.abs((current.pixels.at(0) ?? 0) - (current.body.at(2) ?? 0));
		})
		.toBeLessThan(1);
});

/**
 * The grain is measured from the page centre, like the screen and the
 * content, so a resize adds grain at both edges and leaves what sits under the
 * centred content alone. Anchored to a corner, the grain stayed still while
 * the content slid over it.
 *
 * Sampled at 560px, past the end of the halftone's fade (545px at this
 * height), where the effect is grain on neutral grey whatever the page
 * beneath. The widths differ by an even number of pixels so the centre moves
 * by whole pixels.
 */
test('the grain stays put under the centre of the page across a resize', async ({ page }) => {
	const centreBlock = async (width: number) => {
		await page.setViewportSize({ width, height: 700 });
		await capturedAt(page, width);
		const size = 32;
		const pixels = await readEffects(page, {
			x: width / 2 - size / 2,
			y: 560,
			width: size,
			height: size
		});
		return pixels.filter((_, index) => index % 4 === 0);
	};

	await page.goto('/');
	await pinPageHeight(page);
	await effectsShown(page);
	const narrow = await centreBlock(1000);
	const wide = await centreBlock(1060);
	const meanDifference =
		narrow.reduce((sum, value, index) => sum + Math.abs(value - (wide.at(index) ?? 0)), 0) /
		narrow.length;
	// Identical grain leaves only the gradient's rounding, well under one
	// level; a grain that moved is two unrelated fields, some 20 levels apart.
	expect(meanDifference).toBeLessThan(3);
});

/**
 * The screened text lands on the real text, after a resize as well as on
 * load. Checked in two exact steps rather than by thresholding the effect,
 * whose glyphs, at a 0.4 screen under full-strength grain, are too close to
 * the background to pick out pixel by pixel:
 *
 * - The capture's glyphs against the live page's, ink box to ink box, to 2px.
 *   This is the step that has drifted before: html2canvas, the previous
 *   capture library, was a pixel or two out, and mid-drag it could be twelve.
 * - The effect against the capture: of every shift up to 4px, the unshifted
 *   one correlates best — VFX draws the effect exactly where the capture is.
 *
 * The widths straddle the title's `10vw` breakpoint, so the second one
 * reflows the header rather than only re-centring it.
 */
test('the screened title and subtitle line up with the real ones', async ({ page }) => {
	// Glyph ink inside the header's box, in page coordinates.
	const inkBox = (rgba: number[], width: number, isInk: (pixel: number[]) => boolean) => {
		let [left, top, right, bottom] = [
			Number.POSITIVE_INFINITY,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			Number.NEGATIVE_INFINITY
		];
		for (let index = 0; index < rgba.length / 4; index += 1) {
			if (isInk(rgba.slice(index * 4, index * 4 + 4))) {
				const [x, y] = [index % width, Math.floor(index / width)];
				[left, top, right, bottom] = [
					Math.min(left, x),
					Math.min(top, y),
					Math.max(right, x),
					Math.max(bottom, y)
				];
			}
		}
		return [left, top, right, bottom];
	};

	const compare = async (width: number) => {
		await page.setViewportSize({ width, height: 700 });
		await capturedAt(page, width);

		const header = await page.locator('.landing header').boundingBox();
		if (!header) {
			throw new Error('no header on the landing page');
		}
		const region = {
			x: Math.floor(header.x),
			y: Math.floor(header.y),
			width: Math.ceil(header.width),
			height: Math.ceil(header.height)
		};

		const screened = await readEffects(page, region);
		// The capture itself, from the snapshot's canvas, which covers the body
		// from its top-left corner — the page's, with nothing scrolled.
		const captured = await page.evaluate((box) => {
			const source = document.querySelector<HTMLCanvasElement>('canvas.snapshot-source');
			// Copied out rather than read through the snapshot's own context:
			// reading that one repeatedly draws a Canvas2D performance warning,
			// which the fixture fails the run on.
			const scratch = document.createElement('canvas');
			scratch.width = box.width;
			scratch.height = box.height;
			const context = scratch.getContext('2d');
			if (!(source && context)) {
				throw new Error('no snapshot canvas to read the capture from');
			}
			context.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
			return Array.from(context.getImageData(0, 0, box.width, box.height).data);
		}, region);

		// The live page under the same box, with the effects out of the way.
		// Hiding the canvas moves nothing, so it does not trigger a recapture.
		await page.addStyleTag({ content: '.vfx-canvas { visibility: hidden; }' });
		const shot = await page.screenshot({ clip: region });
		const live = await page.evaluate(async (png) => {
			const image = new Image();
			image.src = `data:image/png;base64,${png}`;
			await image.decode();
			const scratch = document.createElement('canvas');
			scratch.width = image.width;
			scratch.height = image.height;
			const ctx = scratch.getContext('2d');
			if (!ctx) {
				throw new Error('no 2D context to decode the screenshot');
			}
			ctx.drawImage(image, 0, 0);
			return Array.from(ctx.getImageData(0, 0, image.width, image.height).data);
		}, shot.toString('base64'));
		await page.evaluate(() => {
			document.head.lastElementChild?.remove();
		});

		// Glyphs are the amber #ffac00 on a rust wash, in the live page and in
		// the capture alike, so one threshold finds both.
		const liveInk = inkBox(
			live,
			region.width,
			([r = 0, g = 0, b = 0]) => r > 200 && g > 130 && b < 90
		);
		const capturedInk = inkBox(
			captured,
			region.width,
			([r = 0, g = 0, b = 0]) => r > 200 && g > 130 && b < 90
		);
		for (const [index, edge] of liveInk.entries()) {
			expect(
				Math.abs(edge - (capturedInk.at(index) ?? 0)),
				`${width}px, capture edge ${index}`
			).toBeLessThanOrEqual(2);
		}

		// And the effect lands exactly on the capture: of every shift up to 4px
		// each way, the unshifted one correlates best. Blurred first, so the
		// full-strength grain over a 0.4 screen averages out and what is left
		// is the glyphs.
		const effect = boxBlur(screened, region.width, region.height, 2);
		const source = boxBlur(captured, region.width, region.height, 2);
		let best = { dx: Number.NaN, dy: Number.NaN, score: Number.NEGATIVE_INFINITY };
		for (let dy = -4; dy <= 4; dy += 1) {
			for (let dx = -4; dx <= 4; dx += 1) {
				const score = correlationAt(effect, source, region.width, region.height, dx, dy);
				if (score > best.score) {
					best = { dx, dy, score };
				}
			}
		}
		expect([best.dx, best.dy], `${width}px, effect offset from the capture`).toEqual([0, 0]);
	};

	await page.goto('/');
	await pinPageHeight(page);
	await effectsShown(page);
	await compare(1200);
	await compare(640);
});

/**
 * Shrinking the window leaves no horizontal scrollbar. VFX-JS's canvas used
 * to sit on <body>, where its scroll padding was sized from
 * `body.scrollWidth` — which counted the canvas's own, pre-shrink width — so
 * the canvas stayed wider than the window and the page scrolled sideways.
 * It lives in the provider's clipped layer now.
 */
test('shrinking the window leaves no horizontal scroll', async ({ page }) => {
	await page.setViewportSize({ width: 1200, height: 700 });
	await page.goto('/');
	await effectsShown(page);
	for (const width of [1100, 1000, 900, 800]) {
		await page.setViewportSize({ width, height: 700 });
		await capturedAt(page, width);
		// A redraw at the new size, which is when VFX resizes its canvas.
		await readEffects(page, { x: 0, y: 0, width: 1, height: 1 });
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow, `${width}px`).toBe(0);
	}
});
