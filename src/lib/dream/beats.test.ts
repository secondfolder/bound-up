import { describe, expect, it } from 'vitest';
import { splitBeats, tidyBreaks } from './beats';
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

describe('tidyBreaks', () => {
	const tidy = (source: string) =>
		tidyBreaks(parseMarkup(source, { final: true }))
			.map((node) => (node.type === 'tag' ? `<${node.name}>` : node.text))
			.join('|');

	it('makes every paragraph break one, and lets a beat be the break beside it', () => {
		expect(tidy('One.\n\n\n\nTwo.')).toBe('One.\n\nTwo.');
		expect(tidy('One.\n\n<beat/>\n\nTwo.')).toBe('One.|<beat>|Two.');
		expect(tidy('\n\nOne. <say who="a">"Hi."</say> Two.\n')).toBe('One. |<say>| Two.');
	});
});
