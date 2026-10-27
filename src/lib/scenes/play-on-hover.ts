/**
 * Marks what in a menu is pointed at (`data-playing`), for a design to
 * animate it (decora's title and rating beads), and when the
 * pointer leaves, lets what that set going finish the cycle it is in
 * before the mark goes: an animation on `:hover` is cancelled the moment
 * the pointer goes, snapping back from wherever it had got to. So each
 * cycle a design plays this way must end as it began, and finishing one is
 * coming to rest. See docs/scenes.md, "Menu designs".
 *
 * Alias-free: only the DOM, for the editor's menu and a stored one alike.
 */

/**
 * What in a menu can play while pointed at. Not a course: decora's frames
 * pause where they are instead (`animation-play-state`), which suits a
 * pattern that looks the same wherever it stops.
 */
export const PLAYABLE = '.menu-title, .scene-menu-line.item';

/** The attribute a design animates what is pointed at by. */
export const PLAYING = 'data-playing';

/** Plays what is pointed at in `menu` until the returned function is called. */
export function playWhilePointedAt(menu: HTMLElement): () => void {
	/**
	 * What each marked part's mark set going, told apart from what was
	 * running there anyway (a sticker's wiggle) by being new once the mark
	 * was put on; and whether it is winding down, the pointer gone.
	 */
	const playing = new Map<HTMLElement, { started: Animation[]; winding: boolean }>();

	const enter = (element: HTMLElement) => {
		const already = playing.get(element);
		if (already) {
			// Back before it came to rest: it plays on as if never left.
			if (already.winding) {
				already.winding = false;
				for (const animation of already.started) {
					animation.effect?.updateTiming({ iterations: Number.POSITIVE_INFINITY });
				}
			}
			return;
		}
		const before = new Set(element.getAnimations({ subtree: true }));
		element.setAttribute(PLAYING, '');
		const started = element
			.getAnimations({ subtree: true })
			.filter((animation) => !before.has(animation));
		playing.set(element, { started, winding: false });
	};

	const leave = (element: HTMLElement) => {
		const state = playing.get(element);
		if (!state || state.winding) {
			return;
		}
		const finishing: Animation[] = [];
		for (const animation of state.started) {
			const at = animation.effect?.getComputedTiming().currentIteration;
			if (animation.playState === 'idle' || at === null || at === undefined) {
				// Not begun yet (a letter still waiting its turn): nothing to finish.
				animation.cancel();
				continue;
			}
			animation.effect?.updateTiming({ iterations: at + 1 });
			finishing.push(animation);
		}
		const done = () => {
			if (playing.get(element) === state && state.winding) {
				playing.delete(element);
				element.removeAttribute(PLAYING);
			}
		};
		state.winding = true;
		if (finishing.length === 0) {
			done();
			return;
		}
		void Promise.allSettled(finishing.map((animation) => animation.finished)).then(done);
	};

	/** The playable parts around `target`, innermost first, that do not also hold `other`. */
	const around = (target: EventTarget | null, other: EventTarget | null) => {
		const found: HTMLElement[] = [];
		let at = target instanceof Element ? target.closest<HTMLElement>(PLAYABLE) : null;
		while (at && menu.contains(at)) {
			if (!(other instanceof Node && at.contains(other))) {
				found.push(at);
			}
			at = at.parentElement?.closest<HTMLElement>(PLAYABLE) ?? null;
		}
		return found;
	};
	const over = (event: PointerEvent) => {
		for (const element of around(event.target, event.relatedTarget).reverse()) {
			enter(element);
		}
	};
	const out = (event: PointerEvent) => {
		for (const element of around(event.target, event.relatedTarget)) {
			leave(element);
		}
	};

	menu.addEventListener('pointerover', over);
	menu.addEventListener('pointerout', out);
	return () => {
		menu.removeEventListener('pointerover', over);
		menu.removeEventListener('pointerout', out);
	};
}
