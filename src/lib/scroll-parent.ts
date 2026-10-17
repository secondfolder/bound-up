/**
 * Finds the ancestor that actually scrolls.
 *
 * Extracted from `EdgeTask.svelte`, which needed it first and explains why: the app
 * shell gives `<main>` `overflow-y: auto` and takes the scroll off `<body>`, so
 * `window.scrollY` and `window.scrollTo` move nothing at all. Anything that
 * wants to keep something in view has to find the real scrollport.
 *
 * `ThreadView.svelte` needs the identical thing to keep the newest message
 * visible, and two copies of this would drift — one of them would get the
 * `document.scrollingElement` fallback wrong, or the offset arithmetic, and it
 * would only show up as a page that scrolls slightly to the wrong place.
 */
export function scrollParentOf(node: HTMLElement): HTMLElement {
	let candidate = node.parentElement;
	while (candidate) {
		const { overflowY } = getComputedStyle(candidate);
		if (overflowY === 'auto' || overflowY === 'scroll') {
			return candidate;
		}
		candidate = candidate.parentElement;
	}
	return (document.scrollingElement ?? document.documentElement ?? document.body) as HTMLElement;
}

/**
 * True when `target` is wholly inside the scrollport that would move to reach it.
 *
 * Used to decide whether a smooth scroll is worth making: a reader who reveals
 * an embed that lands where they are already looking should not have the page
 * move under them, and one whose embed landed above the fold has no way of
 * knowing anything happened unless it does.
 */
export function isWithinScrollport(target: Element): boolean {
	const scroller = scrollParentOf(target as HTMLElement);
	const rect = target.getBoundingClientRect();
	const bounds =
		scroller === document.scrollingElement
			? { top: 0, bottom: window.innerHeight }
			: scroller.getBoundingClientRect();
	return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
}

/**
 * Scrolls `target` into view inside whichever ancestor really scrolls.
 *
 * The offset arithmetic is the fiddly half: the document's own rect already
 * carries the scroll offset, so only a genuine scrolling element needs its top
 * subtracted. Getting that wrong sends the page to almost the right place,
 * which is harder to notice than sending it nowhere.
 */
export function scrollIntoViewWithin(
	target: Element,
	from: HTMLElement,
	options: { gap?: number; behavior?: ScrollBehavior } = {}
): void {
	const scroller = scrollParentOf(from);
	const scrollerTop =
		scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
	const top =
		target.getBoundingClientRect().top - scrollerTop + scroller.scrollTop - (options.gap ?? 20);
	scroller.scrollTo({ top, behavior: options.behavior ?? 'smooth' });
}

/** How near the end still counts as at it: a reader a few pixels short has not scrolled away. */
const END_SLACK = 48;

/**
 * An attachment that keeps a conversation's scrollport at its end while the
 * reader is there, and leaves it alone once they have scrolled up.
 *
 * Whether they are at the end is decided by where they last scrolled to, not
 * measured when the content changes: by then the new content is already in,
 * so a reader who was at the end would look as if they had scrolled away. It
 * starts at the end, so a conversation opens on its newest. Every child of the
 * scroller is observed, rather than the one list, because more than the list
 * grows: a passage streaming in, suggestions after it, a picture loading, the
 * composer growing as someone types.
 */
export function followEnd(from: HTMLElement): () => void {
	const scroller = scrollParentOf(from);
	const scrollEvents = scroller === document.scrollingElement ? globalThis : scroller;
	let atEnd = true;
	// Where our own last scroll put it. Its scroll event is dispatched a frame
	// later, by when more may have streamed in: measured then, it would look
	// like the reader had scrolled away, and following would stop mid-passage.
	let ours = -1;
	const measure = () => {
		if (scroller.scrollTop === ours) {
			ours = -1;
			return;
		}
		atEnd = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= END_SLACK;
	};
	const follow = () => {
		if (atEnd) {
			const before = scroller.scrollTop;
			scroller.scrollTop = scroller.scrollHeight;
			// Only a scroll that moved anything dispatches an event to clear this.
			if (scroller.scrollTop !== before) {
				ours = scroller.scrollTop;
			}
		}
	};
	const resizes = new ResizeObserver(follow);
	const observeChildren = () => {
		resizes.disconnect();
		resizes.observe(scroller);
		for (const child of scroller.children) {
			resizes.observe(child);
		}
	};
	const children = new MutationObserver(observeChildren);
	children.observe(scroller, { childList: true });
	observeChildren();
	scrollEvents.addEventListener('scroll', measure, { passive: true });
	follow();
	return () => {
		resizes.disconnect();
		children.disconnect();
		scrollEvents.removeEventListener('scroll', measure);
	};
}
