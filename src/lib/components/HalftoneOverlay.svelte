<script lang="ts">
	import { onMount } from 'svelte';
	import { isSafari } from '$lib/browser-engine';
	import {
		buildHalftoneFragmentShader,
		HALFTONE_CAPTURE_IGNORE_SELECTOR,
		halftoneNoiseOrigin
	} from '$lib/halftone';

	/**
	 * A halftone overlay rendered over the live page.
	 *
	 * The page is captured with SnapDOM, then a WebGL fragment shader
	 * re-renders it as a grayscale halftone screen matching Affinity's Halftone
	 * filter. The model — Rec.601 luma, a triangle screen, and a tangent
	 * contrast slope — is documented in [docs/halftone.md](../../../docs/halftone.md)
	 * and lives in `$lib/halftone`, which the shader source is generated from so
	 * the CPU reference renderer and the GPU path cannot drift apart.
	 *
	 * It draws on demand, not every frame: once per capture, and once per prop
	 * change. A still page therefore costs nothing after the first frame — the
	 * previous rAF loop redrew an unchanging full-page canvas 60 times a second,
	 * and because the canvas is soft-light blended the compositor re-blended the
	 * whole viewport each time, which kept Firefox's GPU process near 40% CPU.
	 * Only a non-zero `speed` needs a running loop.
	 *
	 * SnapDOM is imported dynamically inside onMount so it never enters the
	 * SSR graph — it is browser-only, and the server bundle must stay free of
	 * browser-only libraries.
	 */
	type Props = {
		/** Which halftone motif to draw: concentric rings or parallel lines. */
		pattern?: 'circle' | 'line';
		/** Line pattern only: the angle of the lines, in degrees from horizontal. */
		angle?: number;
		/** 0..1, Affinity's 0..100 contrast slider over 100. 0 is a plain
		 * grayscale pass; 1 is a hard black-and-white threshold. */
		contrast?: number;
		/** Size of one halftone cell, in CSS px: the distance between
		 * adjacent ring/line peaks. */
		cellSize?: number;
		/** 0..1, Affinity's 0..100 noise slider over 100. Higher is allowed, but
		 * grain wide enough to clip only survives mid-band and reads as the
		 * band pattern — see docs/halftone.md. */
		noiseStrength?: number;
		/** Pattern drift, in CSS px per second. 0 (the default) keeps the
		 * overlay static, which is what lets it stop drawing. */
		speed?: number;
	};

	let {
		pattern = 'circle',
		angle = 0,
		contrast = 0.5,
		cellSize = 10,
		noiseStrength = 0.5,
		speed = 0
	}: Props = $props();

	let clipElement: HTMLDivElement | undefined = $state();
	let canvas: HTMLCanvasElement | undefined = $state();
	// Set once the WebGL program exists; the effect below uses it to redraw
	// when a prop changes, since nothing else would.
	let requestDraw: (() => void) | undefined = $state();

	$effect(() => {
		// Read every prop the shader uses, so a change to any of them redraws.
		void [pattern, angle, contrast, cellSize, noiseStrength, speed];
		requestDraw?.();
	});

	const vertSrc = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

	const fragSrc = buildHalftoneFragmentShader();

	// How far, in CSS px, the canvas is drawn past the captured page on every
	// side. The clip hides it, so it is only ever seen while the window grows
	// faster than recaptures land: the edges then show more screen instead of
	// the bare page. Past the capture there is nothing to screen, so the shader
	// stretches the page's edge pixels outwards — right for this page, whose
	// edges are its background.
	const BLEED = 240;

	onMount(() => {
		// Bound by the markup below, so always set by the time this runs; the
		// guard is for the type, which cannot know that.
		if (!(clipElement && canvas)) {
			return;
		}
		const clip = clipElement;
		const surface = canvas;
		if (isSafari()) {
			// Safari's soft-light compositing still reads punchier on this
			// grayscale overlay than Chromium's and Firefox's so we tone it down with brightness()
			surface.style.setProperty('filter', 'brightness(0.9)');
		}

		// preserveDrawingBuffer so the composited frame survives past the
		// browser's composite step — without it, reading the canvas back (as the
		// e2e spec does to assert the overlay actually painted) races the buffer
		// clear and can read all-transparent pixels even after a good render.
		const maybeGl = surface.getContext('webgl', { preserveDrawingBuffer: true });
		if (!maybeGl) {
			return;
		}
		// Narrowed alias: TS does not carry the null-guard above into the
		// nested render()/capture() closures, and re-checking there would be
		// noise — by this point the context exists for the component's life.
		const gl: WebGLRenderingContext = maybeGl;

		const compile = (type: number, src: string) => {
			const shader = gl.createShader(type);
			if (!shader) {
				return null;
			}
			gl.shaderSource(shader, src);
			gl.compileShader(shader);
			// A failed compile otherwise renders nothing, silently, forever —
			// the canvas just stays transparent. Surface it so the e2e suite's
			// console-error net catches a broken shader, not only the blank-
			// canvas pixel assertion.
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				console.error('HalftoneOverlay shader failed to compile:', gl.getShaderInfoLog(shader));
			}
			return shader;
		};
		const vertexShader = compile(gl.VERTEX_SHADER, vertSrc);
		const fragmentShader = compile(gl.FRAGMENT_SHADER, fragSrc);
		const prog = gl.createProgram();
		const buf = gl.createBuffer();
		const texture = gl.createTexture();
		// Each is null only when the context has been lost, which leaves nothing
		// to draw with — so no overlay, the same as having no WebGL at all.
		if (!(vertexShader && fragmentShader && prog && buf && texture)) {
			return;
		}
		gl.attachShader(prog, vertexShader);
		gl.attachShader(prog, fragmentShader);
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			console.error('HalftoneOverlay program failed to link:', gl.getProgramInfoLog(prog));
		}
		gl.useProgram(prog);

		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		const aPos = gl.getAttribLocation(prog, 'aPos');
		gl.enableVertexAttribArray(aPos);
		gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

		const uImageOrigin = gl.getUniformLocation(prog, 'uImageOrigin');
		const uImageSize = gl.getUniformLocation(prog, 'uImageSize');
		const uCenter = gl.getUniformLocation(prog, 'uCenter');
		const uPattern = gl.getUniformLocation(prog, 'uPattern');
		const uAngle = gl.getUniformLocation(prog, 'uAngle');
		const uContrast = gl.getUniformLocation(prog, 'uContrast');
		const uCellSize = gl.getUniformLocation(prog, 'uCellSize');
		const uNoiseStrength = gl.getUniformLocation(prog, 'uNoiseStrength');
		const uNoiseOrigin = gl.getUniformLocation(prog, 'uNoiseOrigin');
		const uTime = gl.getUniformLocation(prog, 'uTime');
		const uSpeed = gl.getUniformLocation(prog, 'uSpeed');
		const uImage = gl.getUniformLocation(prog, 'uImage');

		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

		function render(timeSeconds: number) {
			gl.viewport(0, 0, surface.width, surface.height);
			gl.uniform2f(uImageOrigin, BLEED, BLEED);
			gl.uniform2f(uImageSize, surface.width - 2 * BLEED, surface.height - 2 * BLEED);
			// gl_FragCoord y runs bottom-up; the picked center is top-down.
			gl.uniform2f(uCenter, surface.width / 2, surface.height / 2);
			gl.uniform1i(uPattern, pattern === 'line' ? 1 : 0);
			gl.uniform1f(uAngle, (angle * Math.PI) / 180);
			gl.uniform1f(uContrast, contrast);
			gl.uniform1f(uCellSize, cellSize);
			gl.uniform1f(uNoiseStrength, noiseStrength);
			const noiseOrigin = halftoneNoiseOrigin(surface.width, surface.height);
			gl.uniform2f(uNoiseOrigin, noiseOrigin.x, noiseOrigin.y);
			gl.uniform1f(uTime, timeSeconds);
			gl.uniform1f(uSpeed, speed);
			gl.uniform1i(uImage, 0);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, texture);

			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		}

		// Frames are requested, not looped. requestAnimationFrame timestamps are
		// relative to the page's time origin, not this component's mount —
		// anchor on the first frame so a drifting pattern starts still, and so
		// the drift stays bounded however long the tab lives.
		let start: number | null = null;
		let rafId = 0;
		let hasTexture = false;
		const frame = (now: number) => {
			rafId = 0;
			if (start === null) {
				start = now;
			}
			render((now - start) / 1000);
			if (speed !== 0) {
				scheduleFrame();
			}
		};
		function scheduleFrame() {
			// Nothing to screen until the first capture lands, and a frame drawn
			// from an empty texture would only be thrown away.
			if (hasTexture && rafId === 0) {
				rafId = requestAnimationFrame(frame);
			}
		}
		requestDraw = scheduleFrame;

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
			const captured = await snapdom.toCanvas(document.body, {
				dpr: 1, // 1 canvas px = 1 CSS px, which is what cellSize is in
				scale: 1,
				// Exactly the body's box. Left to itself SnapDOM widens the capture
				// to take in content overflowing the body — on a 150px window the
				// title overhangs a body the scrollbar has narrowed to 133px — and
				// a bitmap wider than the clip, centred in it, put every glyph half
				// the overhang to the left. The overhang goes unscreened instead,
				// since the clip that shows the overlay stops at the body anyway.
				clip: { x: box.left, y: box.top, width: box.width, height: box.height },
				// The overlay itself must not feed the capture it is drawn from,
				// and some foreground chrome intentionally sits above the effect
				// rather than being screened by it (the CTA — see the landing
				// page).
				exclude: [(el) => el === clip, HALFTONE_CAPTURE_IGNORE_SELECTOR],
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
			surface.width = captured.width + 2 * BLEED;
			surface.height = captured.height + 2 * BLEED;
			surface.style.width = `${surface.width}px`;
			surface.style.height = `${surface.height}px`;

			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, captured);
			hasTexture = true;
			// Drawn now rather than on the next frame: resizing the canvas above
			// cleared it, and a frame composited before the next draw would
			// show the overlay blank for a moment.
			render(start === null ? 0 : (performance.now() - start) / 1000);
			// Only a drifting pattern needs the loop; a static one has just been
			// drawn, and a frame queued now would draw the same pixels again.
			if (speed !== 0) {
				scheduleFrame();
			}
			// Fade in rather than popping: the capture takes a beat, during which
			// the canvas is sized 0 and invisible. Revealing it with a CSS
			// transition covers the seam between "the page has loaded" and "the
			// effect has rendered". The class stays across recaptures — only the
			// first reveal is animated.
			surface.classList.add('ready');

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
			requestDraw = undefined;
			cancelAnimationFrame(rafId);
			observer.disconnect();
			window.removeEventListener('resize', onLayoutChange);
			document.fonts.removeEventListener('loadingdone', onFontsLoaded);
		};
	});
</script>

<!-- pointer-events: none keeps the overlay decorative — links underneath stay
	clickable. -->
<!-- width/height start at 0 (not the 300×150 default) so anything that waits
     on the canvas being sized — the e2e spec's poll, chiefly — is waiting on
     the capture having run, not on the element merely existing. -->
<svelte:head>
	<!-- The clip's containing block, so it can cover the body in CSS alone. In
	     the component's idiom for body rules: through svelte:head, so it mounts
	     and unmounts with the overlay. -->
	<style>
	body {
		position: relative;
	}
</style>
</svelte:head>

<div bind:this={clipElement} class="halftone-clip" aria-hidden="true">
	<canvas bind:this={canvas} class="halftone" width="0" height="0"></canvas>
</div>

<style>
	.halftone-clip {
		/* Covers the <body> box, which the svelte:head rule above makes its
		   containing block. This used to be fixed and viewport-centred, which
		   only lined up when the document was exactly the viewport: on a short
		   viewport the capture was taller than the screen and its centre sat
		   below the real one.

		   The canvas keeps its captured size and is centred in here, all in
		   CSS, so a resize moves it in the same layout pass that moves the page,
		   with no script in the way. Until the recapture lands, the last frame's
		   screen, grain and centred content stay on the page's centre line
		   rather than being stretched: the edges go uncovered for a moment when
		   the window grows, and are clipped when it shrinks — which is also what
		   stops an outgrown canvas holding the document open at its old size. */
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
		z-index: 9999;
		/* On the clip, not the canvas: the z-index makes the clip a stacking
		   context, and a blend inside one only reaches that context's own
		   (empty) backdrop, not the page under it. */
		mix-blend-mode: soft-light;
	}

	.halftone {
		display: block;

		/* Hidden until the first capture lands, then faded in (see the
		   `ready` class note in capture()). :global because the class is
		   added imperatively from onMount, which the compiler cannot see — a
		   scoped selector would be pruned as unused and the canvas would stay at
		   opacity 0. The landing page's component test does mount the overlay,
		   and in its real browser capture() runs, but it asserts nothing about
		   the canvas, so it is unaffected either way. */
		--overlay-opacity: 1;
		opacity: 0;
		transition: opacity 1.2s ease-out;
		&:global(.ready) {
			opacity: var(--overlay-opacity);
		}
	}
</style>
