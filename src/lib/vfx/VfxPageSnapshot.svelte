<script lang="ts">
	import { onMount } from 'svelte';
	import { getVfx, type VfxAttachOptions } from './context.svelte';
	import { PAGE_SNAPSHOT_IGNORE_SELECTOR } from './snapshot';

	/**
	 * The live page as a VFX-JS element: `<body>` is captured with SnapDOM
	 * into a canvas laid exactly over it, and that canvas is attached to the
	 * nearest `VfxProvider` with the given options — so the effects draw over
	 * the page they were captured from.
	 *
	 * Its own capture rather than VFX's. VFX clones an element into an SVG
	 * foreignObject without its web fonts, so the landing page's title came
	 * back in the fallback face; SnapDOM embeds them, and matches the live page
	 * to the pixel.
	 *
	 * The canvas is invisible (VFX draws the effect in its place) and the
	 * attachment only goes on once the first capture has landed, which is also
	 * what starts the provider's fade-in.
	 *
	 * SnapDOM is imported dynamically inside onMount so it never enters the
	 * SSR graph — it is browser-only, and the server bundle must stay free of
	 * browser-only libraries.
	 */
	let { effect, ...options }: VfxAttachOptions = $props();

	const host = getVfx();
	let clipElement: HTMLDivElement | undefined = $state();
	let canvas: HTMLCanvasElement | undefined = $state();
	let captured = $state(false);

	onMount(() => {
		// Bound by the markup below, so always set by the time this runs; the
		// guard is for the type, which cannot know that.
		if (!(clipElement && canvas)) {
			return;
		}
		const clip = clipElement;
		const surface = canvas;
		const maybeContext = surface.getContext('2d');
		if (!maybeContext) {
			return;
		}
		// Narrowed alias: TS does not carry the null-guard above into the
		// nested capture() closure.
		const surfaceContext: CanvasRenderingContext2D = maybeContext;

		// The capture is of <body>, and the clip the canvas sits in covers the
		// body (in CSS — see the style block), so the canvas scrolls with the
		// page on a viewport too short to hold it instead of staying fixed over
		// content that has moved. The box is measured only to tell when a
		// recapture is due.
		function measureBody() {
			const box = document.body.getBoundingClientRect();
			return {
				left: box.left + window.scrollX,
				top: box.top + window.scrollY,
				width: box.width,
				height: box.height
			};
		}
		type Box = ReturnType<typeof measureBody>;
		const sameBox = (a: Box, b: Box) =>
			a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

		let cancelled = false;
		let captureInFlight = false;
		let captureQueued = false;
		let capturedBox: Box | null = null;

		// Captures run back to back and no faster: one in flight at a time, and
		// any request made meanwhile is folded into a single follow-up that
		// starts the moment it lands. A window-edge drag fires resize events far
		// faster than a capture (which walks and clones the whole document) can
		// finish, and running two at once would only have them share the main
		// thread. There is no throttle beyond that on purpose: resizing is rare,
		// the overlay can only be as current as its latest capture, and keeping
		// up with the drag is worth the CPU for as long as the drag lasts.
		function requestCapture() {
			if (captureInFlight) {
				captureQueued = true;
				return;
			}
			void capture();
		}

		async function capture() {
			captureQueued = false;
			captureInFlight = true;
			// SnapDOM clones the live elements with their computed styles into
			// an SVG foreignObject and lets the browser paint it, with its fonts
			// and resources cached between captures. That makes it both exact —
			// the capture matches the live page to the pixel, where html2canvas,
			// which re-implements CSS painting itself, was a pixel or two off —
			// and fast: 11–16 ms a capture in Firefox against html2canvas's
			// 70–80, most of which went on building a fresh iframe holding a
			// copy of the whole document every time. The difference is what
			// lets the overlay keep up with a window-edge drag.
			const [{ snapdom }] = await Promise.all([
				import('@zumer/snapdom'),
				// A capture taken before the web fonts arrive screens the
				// fallback face, whose metrics move everything below the title.
				document.fonts.ready
			]);
			if (cancelled) {
				return;
			}
			const box = measureBody();
			const bitmap = await snapdom.toCanvas(document.body, {
				dpr: 1, // 1 canvas px = 1 CSS px, which the effects' sizes are in
				scale: 1,
				// Exactly the body's box. Left to itself SnapDOM widens the capture
				// to take in content overflowing the body — on a 150px window the
				// title overhangs a body the scrollbar has narrowed to 133px — and
				// a bitmap wider than the clip, centred in it, put every glyph half
				// the overhang to the left. The overhang goes unscreened instead,
				// since the clip that shows the overlay stops at the body anyway.
				clip: { x: box.left, y: box.top, width: box.width, height: box.height },
				// The capture must not feed on itself — neither this clip nor the
				// effects layer, which carries the ignore attribute — and some
				// foreground chrome intentionally sits above the effect rather
				// than being screened by it (the CTA — see the landing page).
				exclude: [(el) => el === clip, PAGE_SNAPSHOT_IGNORE_SELECTOR],
				// Removed, not hidden. The default leaves an invisible spacer in
				// each excluded element's place, and in a flex <body> those
				// spacers are laid out: they pushed the title down the page and
				// widened the bitmap past the body, which is what first got
				// SnapDOM rejected here as inaccurate.
				excludeMode: 'remove',
				// Measure the clone against the live layout and pin whatever
				// diverges. Without it, text in an inline element (the subtitle)
				// keeps its natural width and could re-wrap, and SnapDOM warns
				// about exactly that on the console. On this page it costs
				// nothing measurable.
				reconcile: true
			});
			captureInFlight = false;
			if (cancelled) {
				return;
			}

			capturedBox = box;
			// Sized in CSS as well as in pixels, so VFX — which draws an element
			// over its box — maps the capture 1:1 onto the page.
			surface.width = bitmap.width;
			surface.height = bitmap.height;
			surface.style.width = `${bitmap.width}px`;
			surface.style.height = `${bitmap.height}px`;
			surfaceContext.drawImage(bitmap, 0, 0);
			if (captured) {
				host.rerender(surface);
			} else {
				captured = true;
			}

			// The page moved while it was being captured (mid-drag, usually).
			// This frame is still shown — a nearly-right frame beats none, and
			// discarding it would blank the overlay for the whole drag — and
			// another is taken to catch up.
			if (captureQueued || !sameBox(box, measureBody())) {
				requestCapture();
			}
		}

		function onLayoutChange() {
			const box = measureBody();
			if (capturedBox && !sameBox(capturedBox, box)) {
				requestCapture();
			}
		}
		// The body's own size covers content reflow; the window resize covers a
		// change that only moves the body, such as the viewport narrowing past a
		// centred column.
		const observer = new ResizeObserver(onLayoutChange);
		observer.observe(document.body);
		window.addEventListener('resize', onLayoutChange);
		// A font that loads late (after `fonts.ready` resolved, e.g. one first
		// used by a later reflow) repaints text without resizing anything.
		const onFontsLoaded = () => requestCapture();
		document.fonts.addEventListener('loadingdone', onFontsLoaded);

		requestCapture();

		return () => {
			cancelled = true;
			observer.disconnect();
			window.removeEventListener('resize', onLayoutChange);
			document.fonts.removeEventListener('loadingdone', onFontsLoaded);
		};
	});
</script>

<!-- width/height start at 0 (not the 300×150 default) so anything that waits
     on the canvas being sized — the e2e specs' polls, chiefly — is waiting on
     the capture having run, not on the element merely existing. -->
<svelte:head>
	<!-- The clip's containing block, so it can cover the body in CSS alone. In
	     the component's idiom for body rules: through svelte:head, so it mounts
	     and unmounts with the snapshot. -->
	<style>
	body {
		position: relative;
	}
</style>
</svelte:head>

<div bind:this={clipElement} class="snapshot-clip" aria-hidden="true">
	<canvas
		bind:this={canvas}
		class="snapshot-source"
		width="0"
		height="0"
		{@attach captured ? host.attach(() => ({ ...options, effect })) : undefined}
	></canvas>
</div>

<style>
	.snapshot-clip {
		/* Covers the <body> box, which the svelte:head rule above makes its
		   containing block. This used to be fixed and viewport-centred, which
		   only lined up when the document was exactly the viewport: on a short
		   viewport the capture was taller than the screen and its centre sat
		   below the real one.

		   The canvas keeps its captured size and is centred in here, all in
		   CSS, so a resize moves it in the same layout pass that moves the page,
		   with no script in the way. VFX draws the effect wherever the canvas
		   is, so until the recapture lands the last frame's screen, grain and
		   centred content stay on the page's centre line rather than being
		   stretched: the effect's bleed covers the edges when the window grows,
		   and the clip stops an outgrown canvas holding the document open at
		   its old size when it shrinks. */
		position: absolute;
		inset: 0;
		overflow: hidden;
		display: grid;
		/* One cell exactly the clip's size, not sized to the canvas, so an
		   oversized canvas overflows its cell rather than growing it. */
		grid-template: minmax(0, 1fr) / minmax(0, 1fr);
		/* `unsafe` centres an overflowing canvas too, cut equally at both
		   edges, where safe alignment would pin it to the start. On a body of
		   fractional height the whole-pixel canvas sits a sub-pixel off centre;
		   painting snaps it to device pixels, so it stays sharp. */
		place-items: unsafe center;
		pointer-events: none;
	}

	.snapshot-source {
		display: block;
		/* Never seen: VFX draws the effect in its place. VFX sets this itself
		   once the canvas is attached; it is here too so the raw capture does
		   not flash up before then. */
		opacity: 0;
	}
</style>
