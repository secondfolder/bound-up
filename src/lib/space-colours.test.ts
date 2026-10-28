import { describe, expect, it } from 'vitest';
import {
	isSpaceColour,
	resolveSpaceColours,
	SPACE_COLOUR_LABELS,
	SPACE_COLOURS,
	spaceColourValue,
	storedSpaceColour
} from './space-colours';

describe('SPACE_COLOURS', () => {
	it('is the signature hues, most pleasing first, since defaults take the first free one', () => {
		expect(SPACE_COLOURS).toEqual(['green', 'pink', 'purple', 'teal', 'red', 'yellow']);
	});

	it('names each by its basic colour word', () => {
		expect(SPACE_COLOURS.map((colour) => SPACE_COLOUR_LABELS[colour])).toEqual([
			'Green',
			'Pink',
			'Purple',
			'Teal',
			'Red',
			'Yellow'
		]);
	});

	it('leaves blue to your own space, and orange and brown to the accent', () => {
		for (const taken of ['blue', 'orange', 'brown', 'amber', 'me']) {
			expect(isSpaceColour(taken)).toBe(false);
		}
	});

	it('draws each from its token, and your own space from its own', () => {
		expect(spaceColourValue('green')).toBe('var(--space-colour-green)');
		expect(spaceColourValue('me')).toBe('var(--space-colour-me)');
	});
});

describe('resolveSpaceColours', () => {
	it('gives each partnership its own colour, in order, without anyone choosing', () => {
		const colours = resolveSpaceColours([
			{ id: 'a', colour: null },
			{ id: 'b', colour: null }
		]);
		expect(colours.get('a')).toBe('green');
		expect(colours.get('b')).toBe('pink');
	});

	it('keeps a chosen colour, and gives the others ones nobody chose', () => {
		const colours = resolveSpaceColours([
			{ id: 'a', colour: null },
			{ id: 'b', colour: SPACE_COLOURS[0] }
		]);
		expect(colours.get('b')).toBe(SPACE_COLOURS[0]);
		expect(colours.get('a')).toBe(SPACE_COLOURS[1]);
	});

	it('cycles once there are more partnerships than colours', () => {
		const spaces = Array.from({ length: SPACE_COLOURS.length + 1 }, (_, index) => ({
			id: `${index}`,
			colour: null
		}));
		const colours = resolveSpaceColours(spaces);
		expect(colours.get(`${SPACE_COLOURS.length}`)).toBe(SPACE_COLOURS[0]);
	});

	it('treats a stored name not on the list as unchosen, so it gets a default', () => {
		const colours = resolveSpaceColours([
			{ id: 'a', colour: 'violet' },
			{ id: 'b', colour: 'lime' },
			{ id: 'c', colour: 'pink' }
		]);
		// Pink is chosen, so the two defaults are the first two left.
		expect([...colours.entries()]).toEqual([
			['a', 'green'],
			['b', 'purple'],
			['c', 'pink']
		]);
	});
});

describe('isSpaceColour', () => {
	it('takes only the closed list', () => {
		expect(isSpaceColour('teal')).toBe(true);
		expect(isSpaceColour('violet')).toBe(false);
		expect(isSpaceColour('#ff0000')).toBe(false);
		expect(isSpaceColour('me')).toBe(false);
	});
});

describe('storedSpaceColour', () => {
	it('keeps a name on the list and reads anything else as not chosen', () => {
		expect(storedSpaceColour('yellow')).toBe('yellow');
		expect(storedSpaceColour(null)).toBeNull();
		expect(storedSpaceColour(undefined)).toBeNull();
		expect(storedSpaceColour('lime')).toBeNull();
		expect(storedSpaceColour('#ff0000')).toBeNull();
	});
});
