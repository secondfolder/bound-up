import { describe, expect, it } from 'vitest';
import {
	DAYDREAM_VOICE_PRESETS,
	type DaydreamNarrator,
	type DaydreamStance,
	leadApplies,
	MAX_DAYDREAM_CHARACTERS,
	voiceCanWork,
	voiceProblem
} from './daydream';

const voice = (narrator: DaydreamNarrator, stance: DaydreamStance, protagonistName = '') => ({
	narrator,
	stance,
	protagonistName
});

describe('voiceProblem', () => {
	it('allows each of the shapes a daydream can take', () => {
		// Character chat: one character, no narrator, as yourself.
		expect(voiceProblem(voice('none', 'self'), 1)).toBeNull();
		// Guided fantasy: no characters, a narrator talking to you.
		expect(voiceProblem(voice('second-person', 'self'), 0)).toBeNull();
		// A voyeur story: two characters, told in the third person, you watching.
		expect(voiceProblem(voice('third-person', 'absent'), 2)).toBeNull();
		// The facility: no characters, an impersonal authority.
		expect(voiceProblem(voice('impersonal', 'self'), 0)).toBeNull();
		// Playing someone else, told about by name.
		expect(voiceProblem(voice('third-person', 'persona', 'Kit'), 1)).toBeNull();
	});

	it('needs someone to speak when there is no narrator', () => {
		expect(voiceProblem(voice('none', 'self'), 0)).toMatch(/add a character/);
		expect(voiceProblem(voice('none', 'absent'), 2)).toMatch(/have to be in the story/);
	});

	it('needs something to watch, and someone for “you” to be', () => {
		expect(voiceProblem(voice('third-person', 'absent'), 0)).toMatch(/to watch/);
		expect(voiceProblem(voice('second-person', 'absent'), 1)).toMatch(/needs you/);
	});

	it('needs a name for a persona', () => {
		expect(voiceProblem(voice('second-person', 'persona'), 0)).toMatch(/name/);
		expect(voiceProblem(voice('second-person', 'persona', '  '), 0)).toMatch(/name/);
	});

	it('agrees with every preset', () => {
		for (const preset of DAYDREAM_VOICE_PRESETS) {
			expect(voiceCanWork(preset.voice), preset.id).toBe(true);
		}
	});

	it('every narrator and stance either works with some cast, or never can', () => {
		const narrators: DaydreamNarrator[] = ['none', 'second-person', 'third-person', 'impersonal'];
		const stances: DaydreamStance[] = ['self', 'persona', 'absent'];
		const never = narrators.flatMap((narrator) =>
			stances
				.filter((stance) => !voiceCanWork({ narrator, stance }))
				.map((stance) => `${narrator}/${stance}`)
		);
		expect(never).toEqual(['none/absent', 'second-person/absent']);
		expect(MAX_DAYDREAM_CHARACTERS).toBeGreaterThan(1);
	});
});

describe('leadApplies', () => {
	it('only with characters, and only when you are there to be led', () => {
		expect(leadApplies(voice('none', 'self'), 1)).toBe(true);
		expect(leadApplies(voice('second-person', 'self'), 0)).toBe(false);
		expect(leadApplies(voice('third-person', 'absent'), 2)).toBe(false);
	});
});
