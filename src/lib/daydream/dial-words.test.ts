import { describe, expect, it } from 'vitest';
import { UNSET_CHARACTER_DIALS } from '../daydream';
import {
	CHARACTER_SLIDERS,
	characterLevel,
	describeCharacterDials,
	describeIdeaDials,
	IDEA_SLIDERS,
	ideaLevel,
	STORY_SLIDERS
} from './dial-words';

describe('the dial words', () => {
	it('gives every step of every slider a label and a phrase', () => {
		for (const slider of [...CHARACTER_SLIDERS, ...IDEA_SLIDERS, ...STORY_SLIDERS]) {
			for (const step of [1, 2, 3, 4, 5] as const) {
				expect(slider.scale[step].label, `${slider.key} ${step}`).not.toBe('');
				expect(slider.scale[step].phrase, `${slider.key} ${step}`).not.toBe('');
			}
		}
	});

	it('says a character’s libido and kink with the rest of their dials', () => {
		expect(describeCharacterDials({ ...UNSET_CHARACTER_DIALS, libido: 1, kink: 5 })).toBe(
			'is not interested in sex; is depraved: into anything the user’s limits allow, taboo included.'
		);
		expect(describeCharacterDials(UNSET_CHARACTER_DIALS)).toBeNull();
	});

	it('says nothing of an idea dial left unset', () => {
		expect(describeIdeaDials({ heat: null, kink: null })).toEqual([]);
		expect(describeIdeaDials({ heat: null, kink: 3 })).toEqual([
			"The idea's kink: kinky: BDSM and power exchange."
		]);
	});

	it('makes heat the ceiling whenever it is set', () => {
		const lines = describeIdeaDials({ heat: 1, kink: null });
		expect(lines[0]).toContain('SFW: nothing sexual at all');
		// Whose dial each is, every time: the idea's, or a character's own.
		expect(lines.at(-1)).toContain(
			"The idea's heat is the ceiling for everyone in it: each character's own libido and kink"
		);
	});

	it('names a starting point’s level, kinky from 3 up', () => {
		expect(ideaLevel({ heat: 1, kink: 1 })).toBe('SFW');
		expect(ideaLevel({ heat: 4, kink: 3 })).toBe('Explicit · kinky');
		expect(ideaLevel({ heat: null, kink: 5 })).toBeNull();
		expect(characterLevel({ ...UNSET_CHARACTER_DIALS, libido: 5, kink: 2 })).toBe('Slutty');
		expect(characterLevel(UNSET_CHARACTER_DIALS)).toBeNull();
	});
});
