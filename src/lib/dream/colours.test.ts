import { describe, expect, it } from 'vitest';
import { SPACE_COLOURS } from '../space-colours';
import { colourValue, colourValues, elementColours, YOU_ID } from './colours';

const character = (id: string) => ({ id, type: 'character' });

describe('elementColours', () => {
	it('gives the user the Me blue, with or without a you element', () => {
		expect(elementColours([]).get(YOU_ID)).toBe('me');
		expect(elementColours([{ id: 'reader', type: 'you' }]).get('reader')).toBe('me');
	});

	it('gives each character its own colour, in the order they came in', () => {
		const colours = elementColours([
			character('ines'),
			{ id: 'studio', type: 'place' },
			character('jun')
		]);
		expect(colours.get('ines')).toBe(SPACE_COLOURS[0]);
		expect(colours.get('jun')).toBe(SPACE_COLOURS[1]);
		// Only people have colours: a place or a pressure does not speak.
		expect(colours.has('studio')).toBe(false);
	});

	it('keeps a character’s colour when another joins after them', () => {
		const before = elementColours([character('ines')]);
		const after = elementColours([character('ines'), character('jun')]);
		expect(after.get('ines')).toBe(before.get('ines'));
	});

	it('goes round again only once every colour is taken', () => {
		const many = Array.from({ length: SPACE_COLOURS.length + 1 }, (_, index) =>
			character(`c${index}`)
		);
		const colours = elementColours(many);
		expect(new Set(many.slice(0, SPACE_COLOURS.length).map(({ id }) => colours.get(id))).size).toBe(
			SPACE_COLOURS.length
		);
		expect(colours.get(`c${SPACE_COLOURS.length}`)).toBe(SPACE_COLOURS[0]);
	});
});

describe('colourValues', () => {
	it('is the theme token for each', () => {
		expect(colourValue('me')).toBe('var(--space-colour-me)');
		expect(colourValues([character('ines')]).get('ines')).toBe(
			`var(--space-colour-${SPACE_COLOURS[0]})`
		);
	});
});
