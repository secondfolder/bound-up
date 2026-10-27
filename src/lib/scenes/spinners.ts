/**
 * Pieces along a menu's top edge that spin when the pointer sweeps over
 * them (`MenuDesign.spinners`: decora's hair clips): each on its own as the
 * pointer reaches it, further the faster the pointer was moving, and the
 * way it was moving. See docs/scenes.md, "Menu designs".
 *
 * Alias-free. The frame builds the pieces (`menu-frame.ts`); this is only
 * how they move, for the editor's menu and a stored one alike.
 */

/** The class of the row the pieces are in, each an `<i>`. */
export const SPINNERS_CLASS = 'menu-spinners';

/** The most a sweep spins a piece, in turns. */
const MOST_TURNS = 4;

/**
 * How far a sweep at `speed` (pixels a millisecond, rightwards positive)
 * spins a piece, in turns, clockwise for rightwards: a quarter turn at the
 * least, so even a slow sweep shows, and none for a pointer that is still.
 * Not whole turns: a piece comes to rest wherever the sweep left it, so a
 * sweep leaves its mark.
 */
export function spinTurns(speed: number): number {
	if (speed === 0) {
		return 0;
	}
	return Math.sign(speed) * Math.min(MOST_TURNS, Math.max(0.25, Math.abs(speed) * 1.5));
}

/** How long a spin of `turns` takes: a longer one runs on, as a flicked clip would. */
export function spinDuration(turns: number): number {
	return 500 + Math.abs(turns) * 300;
}

/**
 * Spins each piece in `menu`'s row as the pointer comes over it, until
 * the returned function is called. Nothing moves for anyone who asked for
 * less motion.
 */
export function spinWhenSwept(menu: HTMLElement): () => void {
	let last: { x: number; time: number } | null = null;
	let speed = 0;
	const moved = (event: PointerEvent) => {
		if (last) {
			speed = (event.clientX - last.x) / Math.max(1, event.timeStamp - last.time);
		}
		last = { x: event.clientX, time: event.timeStamp };
	};
	const reached = (event: PointerEvent) => {
		const piece = event.target instanceof HTMLElement ? event.target : null;
		if (!piece?.parentElement?.classList.contains(SPINNERS_CLASS)) {
			return;
		}
		if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
			return;
		}
		const turns = spinTurns(speed);
		if (turns === 0) {
			return;
		}
		// From wherever an earlier spin has it now, so a second sweep adds to
		// the first rather than snapping it back.
		const from = angleOf(piece);
		const to = from + turns * 360;
		for (const running of piece.getAnimations()) {
			running.cancel();
		}
		piece.animate([{ transform: `rotate(${from}deg)` }, { transform: `rotate(${to}deg)` }], {
			duration: spinDuration(turns),
			easing: 'cubic-bezier(0.15, 0.6, 0.3, 1)',
			fill: 'forwards'
		});
	};
	menu.addEventListener('pointermove', moved);
	menu.addEventListener('pointerover', reached);
	return () => {
		menu.removeEventListener('pointermove', moved);
		menu.removeEventListener('pointerover', reached);
	};
}

/** The angle a piece is turned to now, in degrees. */
function angleOf(piece: HTMLElement): number {
	const { transform } = getComputedStyle(piece);
	if (transform === 'none' || transform === '') {
		return 0;
	}
	const matrix = new DOMMatrixReadOnly(transform);
	return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
}
