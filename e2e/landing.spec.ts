import { expect } from '@playwright/test';
import { test } from './fixtures';

/**
 * The halftone overlay on the logged-out landing page.
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
test('the halftone overlay paints over the landing page', async ({ page }) => {
	await page.goto('/');

	const canvas = page.locator('canvas.halftone');

	// The canvas is only sized once SnapDOM has captured the page and
	// the shader has drawn — width 0 means the effect never ran.
	await expect
		.poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).width), { timeout: 20_000 })
		.toBeGreaterThan(0);

	// Read the WebGL canvas back through a 2D canvas (a WebGL context cannot
	// hand out getImageData itself) and check ink actually landed. The context
	// is created with preserveDrawingBuffer for exactly this readback; without
	// it the buffer is cleared after compositing and this reads blank.
	const paintedFraction = await canvas.evaluate((el) => {
		const canvasEl = el as HTMLCanvasElement;
		const scratch = document.createElement('canvas');
		scratch.width = canvasEl.width;
		scratch.height = canvasEl.height;
		const ctx = scratch.getContext('2d');
		if (!ctx) {
			throw new Error('no 2D context to read the overlay back through');
		}
		ctx.drawImage(canvasEl, 0, 0);
		const { data } = ctx.getImageData(0, 0, scratch.width, scratch.height);
		let painted = 0;
		for (let i = 3; i < data.length; i += 4) {
			if ((data.at(i) ?? 0) > 0) {
				painted += 1;
			}
		}
		return painted / (scratch.width * scratch.height);
	});

	// The current calibration targets Affinity's blend-free line halftone, so
	// the canvas is an opaque grayscale screen rather than a translucent ink
	// overlay. A render that paints under most pixels but leaves the frame
	// non-opaque or coloured is the wrong algorithm, not a stylistic variant.
	expect(paintedFraction).toBeGreaterThan(0.95);

	const { opaqueFraction, meanChannelDelta, leftMin, leftMax, rightMin, rightMax } =
		await canvas.evaluate((el) => {
			const canvasEl = el as HTMLCanvasElement;
			const scratch = document.createElement('canvas');
			scratch.width = canvasEl.width;
			scratch.height = canvasEl.height;
			const ctx = scratch.getContext('2d');
			if (!ctx) {
				throw new Error('no 2D context to read the overlay back through');
			}
			ctx.drawImage(canvasEl, 0, 0);
			const { data } = ctx.getImageData(0, 0, scratch.width, scratch.height);
			let opaque = 0;
			let total = 0;
			let channelDeltaSum = 0;
			for (let i = 3; i < data.length; i += 4) {
				const [red = 0, green = 0, blue = 0, alpha = 0] = data.subarray(i - 3, i + 1);
				if (alpha >= 230) {
					opaque += 1;
				}
				channelDeltaSum += Math.abs(red - green) + Math.abs(green - blue);
				total += 1;
			}

			const sampleColumn = (x: number) => {
				let min = 255;
				let max = 0;
				for (let y = 0; y < scratch.height; y += 1) {
					const v = data.at((y * scratch.width + x) * 4) ?? 0;
					if (v < min) {
						min = v;
					}
					if (v > max) {
						max = v;
					}
				}
				return { min: min / 255, max: max / 255 };
			};

			// Inside the page, not the bleed the canvas is drawn with past it.
			const bleed = (scratch.width - window.innerWidth) / 2;
			const left = sampleColumn(Math.floor(bleed + window.innerWidth * 0.05));
			const right = sampleColumn(Math.floor(bleed + window.innerWidth * 0.95));
			return {
				opaqueFraction: opaque / total,
				meanChannelDelta: channelDeltaSum / total,
				leftMin: left.min,
				leftMax: left.max,
				rightMin: right.min,
				rightMax: right.max
			};
		});
	expect(opaqueFraction).toBeGreaterThan(0.99);
	expect(meanChannelDelta).toBeLessThan(1);

	// At a 15 degree line angle the bands still run near-horizontally, so
	// vertical samples on both sides of the page's left-to-right gradient
	// should oscillate strongly. The bounds come from the model in
	// docs/halftone.md: at contrast 0.4 the slope is tan(36°) = 0.727, so a
	// tone t peaks at t·1.727 and troughs below zero for anything under 0.58.
	// The background runs #943700 (tone 0.30) to #711500 (tone 0.18), which
	// predicts crests near 0.52 on the left and 0.31 on the right, both on a
	// black floor, plus up to 0.078 of grain. Asserting the shape rather than
	// the numbers keeps this honest through tuning.
	expect(leftMin).toBeLessThan(0.05);
	expect(leftMax).toBeGreaterThan(0.4);
	expect(rightMin).toBeLessThan(0.05);
	expect(rightMax).toBeGreaterThan(0.25);
	expect(rightMax).toBeLessThan(0.5);
	expect(leftMax).toBeGreaterThan(rightMax + 0.05);
});

/**
 * The overlay draws on demand. It used to redraw every animation frame even
 * with the drift at 0, and since the canvas is soft-light blended over the
 * whole viewport that kept Firefox's GPU process near 40% CPU on a page where
 * nothing moves. Counting draw calls is the only way to see that from here —
 * the pixels are identical either way.
 */
test('the halftone overlay stops drawing once the page is still', async ({ page }) => {
	await page.addInitScript(() => {
		const counted = globalThis as unknown as { halftoneDraws: number };
		counted.halftoneDraws = 0;
		// A Proxy rather than a replacement function, so the call keeps the
		// context it was made on without the wrapper having to touch `this`.
		WebGLRenderingContext.prototype.drawArrays = new Proxy(
			WebGLRenderingContext.prototype.drawArrays,
			{
				apply(target, context, args) {
					counted.halftoneDraws += 1;
					return Reflect.apply(target, context, args);
				}
			}
		);
	});
	await page.goto('/');

	const canvas = page.locator('canvas.halftone');
	await expect
		.poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).width), { timeout: 20_000 })
		.toBeGreaterThan(0);

	// Draws made across the next 60 animation frames. A loop draws in every
	// one, so it never reads 0; on-demand drawing reads 0 once any late
	// recapture (a font arriving, say) has landed — hence poll, not sample.
	const drawsOverSixtyFrames = () =>
		page.evaluate(async () => {
			const counted = globalThis as unknown as { halftoneDraws: number };
			const before = counted.halftoneDraws;
			for (let i = 0; i < 60; i += 1) {
				await new Promise(requestAnimationFrame);
			}
			return counted.halftoneDraws - before;
		});
	await expect.poll(drawsOverSixtyFrames, { timeout: 10_000 }).toBe(0);
	expect(
		await page.evaluate(() => (globalThis as unknown as { halftoneDraws: number }).halftoneDraws)
	).toBeGreaterThan(0);
});

/**
 * On a viewport shorter than the page, the capture has to cover the whole
 * body at 1:1. html2canvas, the previous capture library, cropped to the
 * window unless told the size, and the cropped bitmap was stretched over the
 * body, which slid the screened subtitle visibly off the real one; before
 * that, the canvas was fixed and viewport-centred, which was off by half the
 * overflow.
 */
test('the halftone overlay covers the body 1:1 on a short viewport, and follows a resize without blanking', async ({
	page
}) => {
	await page.setViewportSize({ width: 900, height: 300 });
	await page.goto('/');
	const canvas = page.locator('canvas.halftone');

	const geometry = () =>
		page.evaluate(() => {
			const el = document.querySelector<HTMLCanvasElement>('canvas.halftone');
			if (!el) {
				throw new Error('no overlay canvas');
			}
			const box = el.getBoundingClientRect();
			const clip = el.parentElement?.getBoundingClientRect();
			if (!clip) {
				throw new Error('overlay canvas has no clip');
			}
			const body = document.body.getBoundingClientRect();
			return {
				pixels: [el.width, el.height],
				box: [box.left, box.top, box.width, box.height],
				clip: [clip.left, clip.top, clip.width, clip.height],
				// Exact, as the clip is: it follows the body's own box. A bitmap
				// is whole pixels, so the capture is this rounded one way or the
				// other.
				body: [body.left, body.top, body.width, body.height]
			};
		});

	await expect
		.poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).height), { timeout: 20_000 })
		.toBeGreaterThan(300);
	let { pixels, box, body } = await geometry();
	// The canvas is the capture plus the same bleed on every side, centred on
	// the body — in CSS, so a body of fractional height leaves the
	// whole-pixel canvas a sub-pixel off centre, never more.
	const bleed = Math.round((pixels[0] - body[2]) / 2);
	expect(bleed).toBeGreaterThan(0);
	for (const [index, size] of pixels.entries()) {
		expect(Math.abs(size - 2 * bleed - (body.at(index + 2) ?? 0)), `size ${index}`).toBeLessThan(1);
	}
	const expected = [body[0] - bleed, body[1] - bleed, pixels[0], pixels[1]];
	for (const [index, edge] of box.entries()) {
		expect(Math.abs(edge - (expected.at(index) ?? 0)), `edge ${index}`).toBeLessThan(1);
	}

	// A drag, in steps: the overlay stays up throughout (it used to hide on
	// every size change until the layout held still). The clip always covers
	// the body, and the canvas inside it keeps a captured size, 1:1 — the last
	// frame is centred until the next capture replaces it, never stretched.
	for (const width of [860, 800, 740, 680, 620]) {
		await page.setViewportSize({ width, height: 300 + (900 - width) });
		await expect(canvas).toBeVisible();
		await expect.poll(async () => (await geometry()).clip).toEqual((await geometry()).body);
		({ pixels, box } = await geometry());
		expect(box.slice(2)).toEqual(pixels);
	}

	await page.setViewportSize({ width: 600, height: 700 });
	await expect
		.poll(async () => (await geometry()).pixels)
		.toEqual([600 + 2 * bleed, 700 + 2 * bleed]);
	({ pixels, box, body } = await geometry());
	expect(body.slice(2)).toEqual([600, 700]);
	await expect(canvas).toBeVisible();

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
			return Math.abs(current.pixels[0] - 2 * bleed - (current.body.at(2) ?? 0));
		})
		.toBeLessThan(1);
});

/**
 * The grain is measured from the page centre, like the screen and the
 * content, so a resize adds grain at both edges and leaves what sits under the
 * centred content alone. Anchored to a corner, the grain stayed still while
 * the content slid over it.
 *
 * Sampled below the header, where the capture is only the background: its
 * gradient is proportional to the width, so its colour at the centre is the
 * same at both widths, and so is the screen, which is centred too. The widths
 * differ by an even number of pixels so the centre moves by whole pixels.
 */
test('the halftone grain stays put under the centre of the page across a resize', async ({
	page
}) => {
	const canvas = page.locator('canvas.halftone');
	const centreBlock = async (width: number) => {
		await page.setViewportSize({ width, height: 700 });
		// The capture has landed once the canvas is the new size plus its
		// bleed, which is the same on both axes — so its width exceeds its
		// height by exactly the viewport's difference.
		await expect
			.poll(
				() =>
					canvas.evaluate((el) => {
						const canvasEl = el as HTMLCanvasElement;
						return canvasEl.height > 0 ? canvasEl.width - canvasEl.height : null;
					}),
				{ timeout: 20_000 }
			)
			.toBe(width - 700);
		return canvas.evaluate((el) => {
			const canvasEl = el as HTMLCanvasElement;
			const scratch = document.createElement('canvas');
			scratch.width = canvasEl.width;
			scratch.height = canvasEl.height;
			const ctx = scratch.getContext('2d');
			if (!ctx) {
				throw new Error('no 2D context to read the overlay back through');
			}
			ctx.drawImage(canvasEl, 0, 0);
			const size = 32;
			const left = canvasEl.width / 2 - size / 2;
			const bleed = (canvasEl.height - window.innerHeight) / 2;
			return Array.from(
				ctx.getImageData(left, bleed + 560, size, size).data.filter((_, i) => i % 4 === 0)
			);
		});
	};

	await page.goto('/');
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
 * load. Compared ink to ink: the bounding box of the title and subtitle's
 * glyphs in a screenshot of the live page, against the bounding box of their
 * screened glyphs in the overlay's own pixels. html2canvas, the previous
 * capture library, was a pixel or two out; mid-drag it could be twelve.
 *
 * The widths straddle the title's `10vw` breakpoint, so the second one
 * reflows the header rather than only re-centring it.
 */
test('the screened title and subtitle line up with the real ones', async ({ page }) => {
	const canvas = page.locator('canvas.halftone');
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
		await expect
			.poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).height - 700), {
				timeout: 20_000
			})
			.toBeGreaterThan(0);
		await expect
			.poll(() =>
				canvas.evaluate((el) => {
					const canvasEl = el as HTMLCanvasElement;
					return canvasEl.width - canvasEl.height;
				})
			)
			.toBe(width - 700);

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

		// The overlay's pixels over the header, read from its own canvas: the
		// capture sits `bleed` in from the canvas's top-left corner.
		const screened = await canvas.evaluate((el, box) => {
			const canvasEl = el as HTMLCanvasElement;
			const bleed = (canvasEl.height - window.innerHeight) / 2;
			const scratch = document.createElement('canvas');
			scratch.width = canvasEl.width;
			scratch.height = canvasEl.height;
			const ctx = scratch.getContext('2d');
			if (!ctx) {
				throw new Error('no 2D context to read the overlay back through');
			}
			ctx.drawImage(canvasEl, 0, 0);
			return Array.from(ctx.getImageData(bleed + box.x, bleed + box.y, box.width, box.height).data);
		}, region);

		// The live page under the same box, with the overlay out of the way.
		// Hiding it moves nothing, so it does not trigger a recapture.
		await page.addStyleTag({ content: '.halftone-clip { visibility: hidden; }' });
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

		// Live glyphs are the amber #ffac00 on a rust wash. Screened glyphs
		// peak at white where the background's crests stop near 160 (see the
		// first test's arithmetic), so a bright threshold keeps only glyphs.
		const liveInk = inkBox(
			live,
			region.width,
			([r = 0, g = 0, b = 0]) => r > 200 && g > 130 && b < 90
		);
		const screenedInk = inkBox(screened, region.width, ([r = 0]) => r > 220);
		for (const [index, edge] of liveInk.entries()) {
			expect(
				Math.abs(edge - (screenedInk.at(index) ?? 0)),
				`${width}px, edge ${index}`
			).toBeLessThanOrEqual(2);
		}
	};

	await page.goto('/');
	await compare(1200);
	await compare(640);
});
