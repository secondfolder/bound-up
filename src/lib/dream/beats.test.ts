import { describe, expect, it } from 'vitest';
import { splitBeats } from './beats';
import { parseMarkup, plainText } from './markup';

const beatsOf = (source: string) =>
	splitBeats(parseMarkup(source, { final: true })).map((beat) => plainText(beat).trim());

describe('splitBeats', () => {
	it('splits at beats and paragraph breaks, never inside a tag, and drops the footer', () => {
		expect(
			beatsOf(
				'She waits.<beat/>You kneel.\n\nShe smiles. <hidden label="x">One.\n\nTwo.</hidden>\n<after>\n{"next":"n"}\n</after>'
			)
		).toEqual(['She waits.', 'You kneel.', 'She smiles. One.\n\nTwo.']);
	});

	it('makes no empty beats', () => {
		expect(beatsOf('<beat/>\n\nOne.<beat/><beat/>Two.\n\n\n')).toEqual(['One.', 'Two.']);
	});
});
