/**
 * Keeps the app shell exactly over the part of the screen that can be seen.
 *
 * iOS does not resize the page when the on-screen keyboard opens. The layout
 * viewport keeps its height, and Safari scrolls the document instead, to bring
 * the caret above the keyboard, even with `overflow: hidden` on `<body>`, which
 * only stops the reader from scrolling it. In a shell that only scrolls its
 * `<main>`, that showed up in three ways. The whole app slid up as you typed
 * and back down as you deleted, because Safari re-scrolled for every caret move.
 * The nav sat behind the keyboard. And the document could be left scrolled
 * after the keyboard closed, with the top of the page off screen, a gap under
 * the nav, and no scrollbar to put it back. `interactive-widget=resizes-content`
 * in the viewport tag is the standard fix, but Safari ignores it.
 *
 * So the shell is `position: fixed` and sized from `visualViewport`. Its height
 * is the visible height, and its top follows how far the visible part has
 * panned within the layout viewport. Then the caret is never under the
 * keyboard, Safari has nothing to scroll for, and a document scroll left
 * behind cannot move the shell. `top` rather than a transform, because a
 * transform would become the containing block of every `position: fixed`
 * element inside the shell, such as the formatting toolbar.
 */
export type ViewportFit = { height: number; top: number };

/**
 * Where the shell goes for a given visual viewport, or `null` to leave it on
 * its CSS fallback.
 *
 * Pinch-zoom is the reason for `null`. iOS has ignored `user-scalable=no` since
 * iOS 10, and a zoomed-in visual viewport is small in CSS pixels. Fitting the
 * shell to it would shrink the app to the zoomed area.
 */
export function viewportFit(viewport: {
	height: number;
	offsetTop: number;
	scale: number;
}): ViewportFit | null {
	if (Math.abs(viewport.scale - 1) > 0.01) {
		return null;
	}
	return { height: Math.round(viewport.height), top: Math.round(viewport.offsetTop) };
}

/**
 * An attachment for the shell. It sets `--viewport-height` and `--viewport-top`
 * on the shell for as long as the visual viewport reports, and removes them
 * where there is none.
 */
export function fitVisualViewport(
	node: HTMLElement,
	viewport: VisualViewport | null = globalThis.visualViewport ?? null
): (() => void) | undefined {
	if (!viewport) {
		return;
	}
	let frame = 0;
	const apply = () => {
		frame = 0;
		const fit = viewportFit(viewport);
		if (fit) {
			node.style.setProperty('--viewport-height', `${fit.height}px`);
			node.style.setProperty('--viewport-top', `${fit.top}px`);
		} else {
			node.style.removeProperty('--viewport-height');
			node.style.removeProperty('--viewport-top');
		}
		// A document scroll Safari left behind does not move the fixed shell any
		// more, but it would still move the page texture on `<body>`. Only once
		// nothing is panned: put back while the keyboard is up, it fights
		// Safari's own scroll for the caret.
		if (fit?.top === 0 && window.scrollY !== 0) {
			window.scrollTo(0, 0);
		}
	};
	// Batched to one write a frame. Safari reports `scroll` many times while the
	// keyboard animates.
	const schedule = () => {
		frame ||= requestAnimationFrame(apply);
	};
	viewport.addEventListener('resize', schedule);
	viewport.addEventListener('scroll', schedule);
	apply();
	return () => {
		cancelAnimationFrame(frame);
		viewport.removeEventListener('resize', schedule);
		viewport.removeEventListener('scroll', schedule);
		node.style.removeProperty('--viewport-height');
		node.style.removeProperty('--viewport-top');
	};
}
