<script lang="ts">
	import type { VFXOpts } from '@vfx-js/core';
	import { onMount, type Snippet } from 'svelte';
	import { isSafari } from '$lib/browser-engine';
	import { setVfx, VfxHost } from './context.svelte';

	/**
	 * One VFX-JS instance for everything inside, through context: elements
	 * opt in with `getVfx().attach(...)`, or through `VfxPageSnapshot`.
	 *
	 * VFX draws every registered element into one canvas of its own, kept over
	 * the viewport, inside a layer this component renders over the body.
	 * `blend` and `opacity` apply to that layer — everything the canvas shows
	 * together — which is why they are props rather than CSS a caller could
	 * write.
	 *
	 * `@vfx-js/core` is imported inside onMount, so it never enters the SSR
	 * graph: it is browser-only, and the server bundle must stay free of
	 * browser-only libraries. Without WebGL2 the children render with no
	 * effects at all.
	 */
	type Props = Pick<VFXOpts, 'pixelRatio' | 'zIndex' | 'postEffect' | 'scrollPadding'> & {
		/**
		 * Whether VFX runs its frame loop (default `true`). Off, it draws only
		 * when asked — after a capture, a parameter change, a scroll or a
		 * resize — and while an attached effect is animating. A page that
		 * holds still then costs nothing after its first frame.
		 */
		autoplay?: boolean;
		/** CSS `mix-blend-mode` for the effects canvas, against the page. */
		blend?: string;
		/** 0..1, for everything the canvas shows together. Per-effect opacity is
		 * `mix()`. */
		opacity?: number;
		children?: Snippet;
	};

	let {
		pixelRatio,
		zIndex,
		postEffect,
		scrollPadding,
		autoplay = true,
		blend = 'normal',
		opacity = 1,
		children
	}: Props = $props();

	const host = setVfx(new VfxHost());
	let layer: HTMLDivElement | undefined = $state();
	let safari = $state(false);

	onMount(() => {
		let cancelled = false;
		safari = isSafari();
		void import('@vfx-js/core').then(({ VFX }) => {
			if (cancelled) {
				return;
			}
			// Read once: VFX takes its options at construction, as
			// @vfx-js/react's provider does. The loop is always started by
			// hand, below, so that `autoplay` stays live.
			//
			// `wrapper`, so the canvas goes in the layer below rather than on
			// the end of <body>. There it widened the page when the window
			// shrank: VFX sizes its scroll padding from `body.scrollWidth`,
			// which counted the old, wider canvas, so the canvas stayed wider
			// than the window and a horizontal scrollbar stuck. With a wrapper
			// VFX leaves the padding unclamped, and the layer's overflow clips
			// it, so the canvas never counts towards the page's size.
			const vfx = VFX.init({
				pixelRatio,
				zIndex,
				postEffect,
				scrollPadding,
				autoplay: false,
				wrapper: layer
			});
			if (!vfx) {
				return;
			}
			// VFX appends its canvas to the wrapper in its constructor and
			// exposes no handle to it, so it is the last element there now.
			const canvas = layer?.lastElementChild;
			if (canvas instanceof HTMLCanvasElement) {
				// A handle for the e2e specs, which read its pixels.
				canvas.classList.add('vfx-canvas');
			}
			host.vfx = vfx;
		});

		// VFX's canvas tracks the viewport, so a scroll or resize needs a new
		// frame even when nothing it draws has changed.
		const redraw = () => host.invalidate();
		window.addEventListener('scroll', redraw, { passive: true });
		window.addEventListener('resize', redraw);

		return () => {
			cancelled = true;
			window.removeEventListener('scroll', redraw);
			window.removeEventListener('resize', redraw);
			host.dispose();
			host.vfx?.destroy();
			host.vfx = null;
		};
	});

	$effect(() => {
		const { vfx } = host;
		if (!(vfx && (autoplay || host.animating))) {
			return;
		}
		vfx.play();
		return () => vfx.stop();
	});

	// Faded in rather than popped: the first capture takes a beat. Held at 0
	// until an element is registered — which, for a snapshot, is once its
	// first capture has landed — then revealed a frame later, after that
	// element's first draw. Only the first reveal is animated in practice,
	// since nothing unregisters on the landing page.
	let revealed = $state(false);
	$effect(() => {
		if (host.registered === 0) {
			revealed = false;
			return;
		}
		const frame = requestAnimationFrame(() => {
			revealed = true;
		});
		return () => cancelAnimationFrame(frame);
	});
</script>

<svelte:head>
	<!-- The layer's containing block, so it can cover the body in CSS alone,
	     through svelte:head so it mounts and unmounts with the provider. -->
	<style>
	body {
		position: relative;
	}
</style>
</svelte:head>

<!-- Where VFX puts its canvas. The blend, the opacity and the fade-in are
     here rather than on the canvas: the z-index makes this a stacking
     context, and a blend inside one reaches only that context's own (empty)
     backdrop, not the page under it. Safari's soft-light reads punchier on a
     grayscale layer than Chromium's and Firefox's, so it is toned down there.
     Faded in rather than popped: see `revealed`. Never captured into
     anything (PAGE_SNAPSHOT_IGNORE_ATTRIBUTE): it shows what captures
     produce. -->
<div
	bind:this={layer}
	class="vfx-layer"
	aria-hidden="true"
	data-vfx-capture-ignore="true"
	style:mix-blend-mode={blend}
	style:filter={blend === 'soft-light' && safari ? 'brightness(0.9)' : undefined}
	style:opacity={revealed ? opacity : 0}
	style:z-index={zIndex ?? 9999}
></div>

{@render children?.()}

<style>
	.vfx-layer {
		/* Covers the body, which the svelte:head rule makes its containing
		   block: VFX wants its wrapper at the page's origin and holding the
		   whole page, and it translates its viewport-sized canvas by the
		   scroll within it. The overflow is what keeps that canvas out of
		   the page's scroll size. */
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		transition: opacity 1.2s ease-out;
	}
</style>
