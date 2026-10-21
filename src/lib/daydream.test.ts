import { describe, expect, it } from 'vitest';
import {
	castingProblem,
	DAYDREAM_VOICE_PRESETS,
	type DaydreamNarrator,
	type DaydreamStance,
	daydreamTitle,
	EMPTY_CASTING,
	fitCastingToIdea,
	inferVoice,
	leadApplies,
	MAX_DAYDREAM_CHARACTERS,
	systemGoverns,
	voiceCanWork,
	voicePreset,
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
		expect(voiceProblem(voice('none', 'absent'), 2)).toMatch(/have to be in the daydream/);
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

describe('voicePreset', () => {
	it('names the preset a voice is, and none for a combination no preset gives', () => {
		expect(voicePreset(voice('impersonal', 'self'))?.id).toBe('rules');
		expect(voicePreset(voice('third-person', 'self'))).toBeUndefined();
	});

	it('gives every preset a description and an example to show beside the list', () => {
		for (const preset of DAYDREAM_VOICE_PRESETS) {
			expect(preset.description, preset.id).not.toBe('');
			expect(preset.examples.length, preset.id).toBeGreaterThan(0);
		}
	});
});

describe('inferVoice', () => {
	it('is a story told to you with nobody in it, and talking with them with anyone', () => {
		expect(inferVoice(voice('none', 'self'), 0)).toEqual(voice('second-person', 'self'));
		expect(inferVoice(voice('second-person', 'self'), 1)).toEqual(voice('none', 'self'));
		expect(inferVoice(voice('second-person', 'self'), 3)).toEqual(voice('none', 'self'));
	});

	it('always guesses a voice that works with that cast', () => {
		for (let count = 0; count <= MAX_DAYDREAM_CHARACTERS; count += 1) {
			expect(voiceProblem(inferVoice(voice('third-person', 'absent'), count), count)).toBeNull();
		}
	});

	it('keeps what the story calls the user', () => {
		expect(inferVoice(voice('none', 'self', 'Kit'), 0).protagonistName).toBe('Kit');
	});

	it('never guesses a monologue, which is only ever chosen', () => {
		for (let count = 0; count <= MAX_DAYDREAM_CHARACTERS; count += 1) {
			expect(inferVoice(voice('monologue', 'self'), count).narrator).not.toBe('monologue');
		}
	});
});

describe('a monologue', () => {
	it('works with or without characters, and wherever the user stands', () => {
		for (let count = 0; count <= MAX_DAYDREAM_CHARACTERS; count += 1) {
			for (const stance of ['self', 'persona', 'absent'] as const) {
				expect(
					voiceProblem(voice('monologue', stance, 'Kit'), count),
					`${stance}, ${count}`
				).toBeNull();
			}
		}
	});

	it('is a preset, and nobody leads it', () => {
		expect(voicePreset(voice('monologue', 'self'))?.id).toBe('monologue');
		expect(leadApplies(voice('monologue', 'self'), 2)).toBe(false);
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
	it('is the daydream’s own name, or its idea’s until it has one', () => {
		const idea = { title: 'After hours' };
		expect(daydreamTitle({ title: 'Late', idea })).toBe('Late');
		expect(daydreamTitle({ title: '  ', idea })).toBe('After hours');
	});
});

describe('casting', () => {
	const parts = [{ id: 'p1' }, { id: 'p2' }];
	const cast = (partId: string | null, relationship = '') => ({
		casting: { ...EMPTY_CASTING, partId, relationship }
	});

	it('fits an idea when every part cast is one it has, played once', () => {
		expect(castingProblem([cast('p1'), cast('p2'), cast(null), cast(null)], parts)).toBeNull();
		expect(castingProblem([cast('p3')], parts)).toContain('no longer has');
		expect(castingProblem([cast('p1'), cast('p1')], parts)).toContain('only be played by one');
	});

	it('lets go of the parts a new idea does not have, and keeps the words', () => {
		expect(
			fitCastingToIdea([cast('p1', 'your boss'), cast('p3', 'your rival')], [{ id: 'p1' }])
		).toEqual([cast('p1', 'your boss'), cast(null, 'your rival')]);
	});
});

describe('a system that governs a character', () => {
	const command = { ...voice('impersonal', 'self'), governs: 'character' as const };

	it('is its own preset, and the plain system is still "rules"', () => {
		expect(voicePreset(command)?.id).toBe('command');
		expect(voicePreset(voice('impersonal', 'self'))?.id).toBe('rules');
	});

	it('needs a character to govern, and only a system can govern one', () => {
		expect(voiceProblem(command, 0)).toBe('Add the character the system governs.');
		expect(voiceProblem(command, 1)).toBeNull();
		expect(voiceProblem({ ...voice('none', 'self'), governs: 'character' }, 1)).toBe(
			'Only a system governs someone else.'
		);
	});

	it('is what someone watching a system always watches', () => {
		expect(systemGoverns(voice('impersonal', 'absent'))).toBe('character');
		expect(systemGoverns(voice('impersonal', 'self'))).toBe('user');
		expect(systemGoverns(command)).toBe('character');
	});

	it('is cleared by choosing any other preset', () => {
		const rules = DAYDREAM_VOICE_PRESETS.find((preset) => preset.id === 'rules');
		expect({ ...command, ...rules?.voice }.governs).toBeUndefined();
	});
});
