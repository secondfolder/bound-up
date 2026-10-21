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

/** Room left above an element followed to the top of the scrollport (`followEnd`'s `holdAt`). */
const HOLD_GAP = 8;

/** Where `target`'s top is in `scroller`'s content, as a `scrollTop` would put it at the top. */
function topWithin(target: Element, scroller: HTMLElement): number {
	const scrollerTop =
		scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
	return target.getBoundingClientRect().top - scrollerTop + scroller.scrollTop;
}

/**
 * Where following the end goes while it holds at an element whose top is at
 * `holdTop`: towards the end, but no further than puts that top a little
 * below the top of the scrollport — and never back up from where it is.
 */
export function heldScrollTop(current: number, end: number, holdTop: number): number {
	return Math.max(current, Math.min(end, holdTop - HOLD_GAP));
}

/** How long after a conversation opens following still jumps rather than glides (`followEnd`). */
const SMOOTH_AFTER_MS = 1500;

/** How near the end still counts as at it: a reader a few pixels short has not scrolled away. */
const END_SLACK = 48;

/**
 * An attachment that keeps a conversation's scrollport at its end while the
 * reader is there, and leaves it alone once they have scrolled up.
 *
 * Whether they are at the end is decided by where they last scrolled to, not
 * measured when the content changes: by then the new content is already in,
 * so a reader who was at the end would look as if they had scrolled away. It
 * starts at the end, so a conversation opens on its newest. More than the list
 * grows — a passage streaming in, suggestions after it, a picture loading, the
 * composer growing as someone types — so the list is observed, and so is every
 * element between it and the scroller, and every child of the scroller. Not
 * only the children: a page root held to the viewport's height (the daydream
 * page's `min-block-size: 100%`, in a flex column that may shrink it) lets the
 * story overflow it without changing size itself, and following never woke.
 *
 * Only a scroll *upwards* counts as leaving the end. Most scrolls are not the
 * reader's: ours, dispatched a frame late, by when more may have streamed in;
 * and the browser's scroll anchoring, which moves the scrollport down when an
 * earlier turn grows as it opens. Either, measured as "short of the end",
 * stopped the following — a daydream opened part-way down its story and
 * stayed there as passages arrived. Neither ever moves it up, and a reader
 * scrolling away from the newest always does.
 *
 * `holdAt` names an element following stops at: the scrollport goes no
 * further than puts its top at the top of the scrollport, and the rest waits
 * for the reader to scroll. A daydream holds at the passage arriving, so a
 * passage longer than the screen is not scrolled past before it is read
 * (docs/daydreams.md, "Following the story"). Holding never moves the
 * scrollport up, so a reader who has already scrolled past that point stays
 * where they are. A message thread holds at its oldest unread message, so it
 * opens with that at the top rather than scrolled past it.
 *
 * Following glides (a smooth scroll) once the conversation has opened, so a
 * new message or a passage arriving visibly slides in rather than appearing
 * with a jump that loses the reader's place. It jumps while opening, for
 * `smoothAfter` (the time it takes bodies to decrypt and pictures to load),
 * because a glide down a whole conversation on every page load is motion
 * for nothing. It also jumps further than a screen (catching up after a
 * burst, which a glide would scroll past too fast to read), and always for a
 * reader who asks for reduced motion.
 */
export function followEnd(
	from: HTMLElement,
	options: { holdAt?: () => Element | null; smoothAfter?: number } = {}
): () => void {
	const scroller = scrollParentOf(from);
	const scrollEvents = scroller === document.scrollingElement ? globalThis : scroller;
	const openedAt = performance.now();
	const smoothAfter = options.smoothAfter ?? SMOOTH_AFTER_MS;
	let atEnd = true;
	let lastTop = scroller.scrollTop;
	let lastHeight = scroller.scrollHeight;
	const measure = () => {
		const top = scroller.scrollTop;
		const height = scroller.scrollHeight;
		if (height - top - scroller.clientHeight <= END_SLACK) {
			atEnd = true;
		} else if (top < lastTop && height === lastHeight) {
			// Upwards with the content unchanged is the reader. Upwards while it
			// changed is layout: a sent message swapped for the stored one in the
			// middle of our glide moved the scrollport up 40px and cut the glide
			// short, and reading that as the reader left a thread stopped short of
			// its newest. Only the production build answers a send fast enough to
			// land inside the glide, so it showed only against the Docker image.
			atEnd = false;
		}
		lastTop = top;
		lastHeight = height;
	};
	const follow = () => {
		if (atEnd) {
			const hold = options.holdAt?.();
			const end = scroller.scrollHeight - scroller.clientHeight;
			const top = hold ? heldScrollTop(scroller.scrollTop, end, topWithin(hold, scroller)) : end;
			const distance = Math.abs(top - scroller.scrollTop);
			if (distance < 1) {
				return;
			}
			const glide =
				performance.now() - openedAt >= smoothAfter &&
				distance <= scroller.clientHeight &&
				!matchMedia('(prefers-reduced-motion: reduce)').matches;
			if (glide) {
				// `lastTop` stays where the glide starts: every scroll event on the
				// way is further down, which `measure` never reads as leaving.
				scroller.scrollTo({ top, behavior: 'smooth' });
			} else {
				scroller.scrollTop = top;
				lastTop = scroller.scrollTop;
			}
		}
	};
	const resizes = new ResizeObserver(follow);
	const observeChildren = () => {
		resizes.disconnect();
		resizes.observe(scroller);
		for (let node: Element | null = from; node && node !== scroller; node = node.parentElement) {
			resizes.observe(node);
		}
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
