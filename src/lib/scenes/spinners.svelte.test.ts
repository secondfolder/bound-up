import { afterEach, describe, expect, it } from 'vitest';
import { SPINNERS_CLASS, spinWhenSwept } from './spinners';

/** A menu with a row of three pieces, its spinning switched on. */
function menuWithPieces() {
	const menu = document.createElement('section');
	const row = document.createElement('span');
	row.className = SPINNERS_CLASS;
	row.append(...Array.from({ length: 3 }, () => document.createElement('i')));
	menu.append(row);
	document.body.append(menu);
	const stop = spinWhenSwept(menu);
	const pieces = [...row.children] as HTMLElement[];
	return { menu, pieces, stop };
}

/** The pointer moving rightwards over the menu, then onto `piece`. */
function sweep(menu: HTMLElement, piece: HTMLElement) {
	menu.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 0 }));
	piece.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 40 }));
	piece.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: 40 }));
}

const realMatchMedia = globalThis.matchMedia;

afterEach(() => {
	globalThis.matchMedia = realMatchMedia;
	document.body.replaceChildren();
});

describe('clips that spin when swept', () => {
	it('spins only the piece the pointer reaches, and again from where it is', () => {
		const { menu, pieces, stop } = menuWithPieces();
		const [first, second] = pieces;
		if (!(first && second)) {
			throw new Error('The row has no pieces');
		}
		sweep(menu, first);
		expect(first.getAnimations()).toHaveLength(1);
		expect(second.getAnimations()).toHaveLength(0);

		// A second sweep replaces the first spin rather than piling up.
		sweep(menu, first);
		expect(first.getAnimations()).toHaveLength(1);

		stop();
		sweep(menu, second);
		expect(second.getAnimations()).toHaveLength(0);
	});

	it('leaves everything still for anyone who asked for less motion', () => {
		globalThis.matchMedia = ((query: string) =>
			({ matches: query.includes('reduce'), media: query }) as MediaQueryList) as typeof matchMedia;
		const { menu, pieces } = menuWithPieces();
		const [first] = pieces;
		if (!first) {
			throw new Error('The row has no pieces');
		}
		sweep(menu, first);
		expect(first.getAnimations()).toHaveLength(0);
	});
});
