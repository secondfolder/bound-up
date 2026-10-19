import { describe, expect, it } from 'vitest';
import type { DaydreamNarrator, DaydreamStance, DialValue } from '../daydream';
import { testCharacter, testScene } from '../testing/daydream-setup';
import { castNotes, type SentencePiece, setupSentence } from './sentence';

function setup(
	narrator: DaydreamNarrator,
	stance: DaydreamStance,
	names: string[],
	heat: DialValue | null = 3,
	protagonistName = ''
) {
	return {
		voice: { narrator, stance, protagonistName },
		characters: names.map((name, at) =>
			testCharacter({
				name,
				casting: {
					partId: at === 0 ? 'p1' : null,
					relationship: at === 0 ? 'your boss' : '',
					part: ''
				}
			})
		),
		scene: testScene({
			title: 'After hours',
			parts: [{ id: 'p1', name: 'the interviewer', description: '' }],
			dials: { heat, kink: null }
		})
	};
}

/** The sentence as text, with each blank in brackets. */
const read = (pieces: SentencePiece[]) =>
	pieces
		.map((piece) => {
			switch (piece.kind) {
				case 'text':
					return piece.text;
				case 'heat':
				case 'voice':
					return `[${piece.label}]`;
				case 'character':
					return `[${piece.name}]`;
				default:
					return `[${piece.title}]`;
			}
		})
		.join('');

describe('setupSentence', () => {
	it('says each preset in plain words', () => {
		expect(read(setupSentence(setup('none', 'self', ['Mara'])))).toBe(
			'I want a [steamy] story where I [talk with] [Mara] in [After hours].'
		);
		expect(read(setupSentence(setup('second-person', 'self', [])))).toBe(
			'I want a [steamy] story [told to me] in [After hours].'
		);
		expect(read(setupSentence(setup('second-person', 'self', ['Mara'])))).toBe(
			'I want a [steamy] story [told to me] in [After hours], with [Mara].'
		);
		expect(read(setupSentence(setup('third-person', 'absent', ['Ash', 'Bel', 'Cy'])))).toBe(
			'I want a [steamy] story where I [watch] [Ash], [Bel] and [Cy] in [After hours].'
		);
		expect(read(setupSentence(setup('impersonal', 'self', ['Mara'])))).toBe(
			'I want a [steamy] story where [a system gives me orders] in [After hours], enforced by [Mara].'
		);
	});

	it('takes “an” before a vowel, keeps SFW as it is, and has a blank for no heat at all', () => {
		expect(read(setupSentence(setup('none', 'self', ['Mara'], 4)))).toMatch(
			/^I want an \[explicit\]/
		);
		expect(read(setupSentence(setup('none', 'self', ['Mara'], 1)))).toMatch(/^I want a \[SFW\]/);
		expect(read(setupSentence(setup('none', 'self', ['Mara'], null)))).toMatch(
			/^I want \[any kind of\] story/
		);
	});

	it('names a voice no preset gives, with whoever the user is playing', () => {
		expect(read(setupSentence(setup('third-person', 'persona', ['Mara'], 3, 'Kit')))).toBe(
			'I want a [steamy] story, [told my own way], as Kit, with [Mara] in [After hours].'
		);
	});

	it('points each character blank at their place in the list', () => {
		const pieces = setupSentence(setup('none', 'self', ['Ash', 'Bel']));
		expect(pieces.filter((piece) => piece.kind === 'character')).toEqual([
			{ kind: 'character', index: 0, name: 'Ash' },
			{ kind: 'character', index: 1, name: 'Bel' }
		]);
	});
});

describe('castNotes', () => {
	it('says each character’s part and who they are, and just the name when neither is written', () => {
		expect(castNotes(setup('none', 'self', ['Mara', 'Bel']))).toEqual([
			'Mara: the interviewer, your boss',
			'Bel'
		]);
	});
});
