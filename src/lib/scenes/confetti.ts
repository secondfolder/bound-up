/**
 * Confetti falling behind a menu (`MenuDesign.confetti`: decora's rainbow
 * sprinkles and the odd star), as many pieces as the menu's size calls for,
 * so it is as thick on a phone as across a page. See docs/scenes.md, "Menu
 * designs".
 *
 * The menu is cut into lanes across and slots down, a piece to each, and a
 * piece is worked out from its lane and slot alone: where it falls, how
 * fast, how it spins, what it is. So when the menu grows, the pieces it had
 * stay as they were, falling where they were, and only the new lanes and
 * slots get pieces of their own; when it shrinks, those go.
 *
 * Alias-free: the pure working-out, and the DOM for the editor's menu and a
 * stored one alike.
 */

/** The class of the layer the pieces fall in, each an `<i>`. */
export const CONFETTI_CLASS = 'menu-confetti';

/** How wide a lane is, and how much of its height a piece has to itself, in rem. */
const LANE = 2.5;
const SLOT = 4;

/** How many lanes and slots a menu this size (in rem) has. */
export function confettiGrid(width: number, height: number): { lanes: number; slots: number } {
	return { lanes: Math.ceil(width / LANE), slots: Math.ceil(height / SLOT) };
}

/** The colours a sprinkle can be. */
const SPRINKLES = ['#ffd23f', '#3fa7ff', '#3ddc84', '#a86bff', '#fff36b', '#ff9f1c'];

/** One piece: where in its lane, when and how fast it falls and spins, and what it is. */
export type ConfettiPiece = {
	/** From the menu's left, in rem. */
	x: number;
	/** Where it is when nothing moves, down the menu, in percent. */
	y: number;
	/** How long a fall takes, in seconds. */
	fall: number;
	/** How far into its fall it starts, in seconds. */
	delay: number;
	/** How long a turn takes, in seconds, and which way. */
	spin: number;
	reverse: boolean;
	/** How far it drifts sideways over a fall, in rem, and how it is turned to begin with. */
	drift: number;
	turn: number;
	/** A star now and then, otherwise a sprinkle of `colour`. */
	star: boolean;
	colour: string;
};

/** A piece, from its lane and slot alone, the same every time. */
export function confettiPiece(lane: number, slot: number): ConfettiPiece {
	const next = seeded(lane * 7919 + slot * 104_729 + 1);
	return {
		x: (lane + next()) * LANE,
		y: next() * 100,
		// Very slowly, to be there rather than watched.
		fall: 70 + next() * 30,
		delay: -next() * 100,
		spin: 24 + next() * 16,
		reverse: next() < 0.5,
		drift: (next() - 0.5) * 1.2,
		turn: next() * 360,
		star: next() < 0.12,
		colour: SPRINKLES[Math.floor(next() * SPRINKLES.length)] ?? '#ffd23f'
	};
}

/** A small seeded random (mulberry32), so a piece is the same each time it is drawn. */
function seeded(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d_2b_79_f5) >>> 0;
		let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
	};
}

/** A piece's element, its working-out handed to the design as custom properties. */
function drawPiece(doc: Document, piece: ConfettiPiece): HTMLElement {
	const drawn = doc.createElement('i');
	drawn.className = piece.star ? 'star' : 'sprinkle';
	const set = (name: string, value: string) => drawn.style.setProperty(name, value);
	set('--x', `${piece.x.toFixed(2)}rem`);
	set('--y', piece.y.toFixed(1));
	set('--fall', `${piece.fall.toFixed(1)}s`);
	set('--delay', `${piece.delay.toFixed(1)}s`);
	set('--spin', `${piece.spin.toFixed(1)}s`);
	set('--spin-way', piece.reverse ? 'reverse' : 'normal');
	set('--drift', `${piece.drift.toFixed(2)}rem`);
	set('--turn', `${piece.turn.toFixed(0)}deg`);
	set('--colour', piece.colour);
	return drawn;
}

/**
 * Keeps `layer` holding as many pieces as its size calls for, until the
 * returned function is called, or until it leaves the page after being on
 * it: the editor's menu is drawn afresh with a new design, and has no hook
 * to stop it.
 */
export function keepConfetti(layer: HTMLElement): () => void {
	const doc = layer.ownerDocument;
	const drawn = new Map<string, HTMLElement>();
	let shown = false;
	const fill = () => {
		shown ||= layer.isConnected;
		if (shown && !layer.isConnected) {
			stop();
			return;
		}
		const rem = Number.parseFloat(getComputedStyle(doc.documentElement).fontSize) || 16;
		const { lanes, slots } = confettiGrid(layer.clientWidth / rem, layer.clientHeight / rem);
		for (const [key, piece] of drawn) {
			const [lane = 0, slot = 0] = key.split(':').map(Number);
			if (lane >= lanes || slot >= slots) {
				piece.remove();
				drawn.delete(key);
			}
		}
		const added: HTMLElement[] = [];
		for (let lane = 0; lane < lanes; lane += 1) {
			for (let slot = 0; slot < slots; slot += 1) {
				const key = `${lane}:${slot}`;
				if (!drawn.has(key)) {
					const piece = drawPiece(doc, confettiPiece(lane, slot));
					drawn.set(key, piece);
					added.push(piece);
				}
			}
		}
		layer.append(...added);
	};
	const resized = new ResizeObserver(fill);
	resized.observe(layer);
	const stop = () => {
		resized.disconnect();
	};
	return stop;
}
