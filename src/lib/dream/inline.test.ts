import { describe, expect, it } from 'vitest';
import { inlineSegments, speakerShade } from './inline';

const names = [
	{ id: 'varga', name: 'Varga' },
	{ id: 'varga', name: 'Ms Varga' },
	{ id: 'eli', name: 'Eli' }
];

describe('inlineSegments', () => {
	it('draws emphasis', () => {
		expect(inlineSegments('She *waits*, then **speaks**.')).toEqual([
			{ kind: 'text', text: 'She ' },
			{ kind: 'em', text: 'waits' },
			{ kind: 'text', text: ', then ' },
			{ kind: 'strong', text: 'speaks' },
			{ kind: 'text', text: '.' }
		]);
	});

	it('links names as whole words, the longest first', () => {
		expect(inlineSegments('Ms Varga nods to Eli. Elise does not.', names)).toEqual([
			{ kind: 'link', text: 'Ms Varga', id: 'varga' },
			{ kind: 'text', text: ' nods to ' },
			{ kind: 'link', text: 'Eli', id: 'eli' },
			{ kind: 'text', text: '. Elise does not.' }
		]);
	});

	it('leaves a stray asterisk alone, and names inside emphasis unlinked', () => {
		expect(inlineSegments('5 * 3 and *Varga*', names)).toEqual([
			{ kind: 'text', text: '5 * 3 and ' },
			{ kind: 'em', text: 'Varga' }
		]);
	});
});

describe('speakerShade', () => {
	it('gives the same speaker the same shade', () => {
		expect(speakerShade('ottilie')).toBe(speakerShade('ottilie'));
		expect(speakerShade('ottilie')).toBeLessThan(5);
	});
});
