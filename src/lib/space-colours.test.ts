import { describe, expect, it } from 'vitest';
import { isSpaceColour, resolveSpaceColours, SPACE_COLOURS } from './space-colours';

describe('resolveSpaceColours', () => {
	it('gives each partnership its own colour, in order, without anyone choosing', () => {
		const colours = resolveSpaceColours([
			{ id: 'a', colour: null },
			{ id: 'b', colour: null }
		]);
		expect(colours.get('a')).toBe(SPACE_COLOURS[0]);
		expect(colours.get('b')).toBe(SPACE_COLOURS[1]);
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
});

describe('isSpaceColour', () => {
	it('takes only the closed list', () => {
		expect(isSpaceColour('teal')).toBe(true);
		expect(isSpaceColour('#ff0000')).toBe(false);
		expect(isSpaceColour('me')).toBe(false);
	});
});
