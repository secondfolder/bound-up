import { describe, expect, it } from 'vitest';
import {
	castingProblem,
	DAYDREAM_VOICE_PRESETS,
	type DaydreamNarrator,
	type DaydreamStance,
	daydreamTitle,
	EMPTY_CASTING,
	fitCastingToScene,
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

describe('daydreamTitle', () => {
	it('is the daydream’s own name, or its scene’s until it has one', () => {
		const scene = { title: 'After hours' };
		expect(daydreamTitle({ title: 'Late', scene })).toBe('Late');
		expect(daydreamTitle({ title: '  ', scene })).toBe('After hours');
	});
});

describe('casting', () => {
	const parts = [{ id: 'p1' }, { id: 'p2' }];
	const cast = (partId: string | null, relationship = '') => ({
		casting: { ...EMPTY_CASTING, partId, relationship }
	});

	it('fits a scene when every part cast is one it has, played once', () => {
		expect(castingProblem([cast('p1'), cast('p2'), cast(null), cast(null)], parts)).toBeNull();
		expect(castingProblem([cast('p3')], parts)).toContain('no longer has');
		expect(castingProblem([cast('p1'), cast('p1')], parts)).toContain('only be played by one');
	});

	it('lets go of the parts a new scene does not have, and keeps the words', () => {
		expect(
			fitCastingToScene([cast('p1', 'your boss'), cast('p3', 'your rival')], [{ id: 'p1' }])
		).toEqual([cast('p1', 'your boss'), cast(null, 'your rival')]);
	});
});
