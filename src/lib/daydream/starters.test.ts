import { describe, expect, it } from 'vitest';
import { DAYDREAM_VOICE_PRESETS, UNSET_CHARACTER_DIALS } from '../daydream';
import { daydreamSetupFormSchema } from '../schemas/daydreamForm';
import { CHARACTER_TEMPLATES, SCENE_TEMPLATES } from './catalog';
import {
	assembleSetup,
	DAYDREAM_IDEA_CHIPS,
	DAYDREAM_STARTERS,
	type StoryPieces,
	starterScene,
	starterSetup
} from './starters';

/** Ids that say which part they are, so a test can read a casting. */
function counter() {
	let next = 0;
	return () => {
		next += 1;
		return `id-${next}`;
	};
}

const character = (name: string) => ({ ...CHARACTER_TEMPLATES[0].character, name });

const pieces = (overrides: Partial<StoryPieces> = {}): StoryPieces => ({
	voice: 'talk',
	scene: {
		title: 'The night train',
		setting: 'a sleeper carriage',
		premise: 'A stranger takes the seat across from you.',
		yourRole: 'a passenger',
		tone: 'mysterious',
		notes: '',
		parts: [
			{ name: 'the stranger', description: 'boarded at the last stop' },
			{ name: 'the guard', description: '' }
		],
		dials: { heat: 2, kink: 1 }
	},
	cast: [
		{ character: character('Vesper'), partName: 'The Stranger', relationship: 'r', doing: 'd' }
	],
	...overrides
});

describe('the ready-made stories', () => {
	it('each builds a setup the form would save', () => {
		for (const starter of DAYDREAM_STARTERS) {
			const setup = starterSetup(starter);
			expect(daydreamSetupFormSchema.safeParse(setup).success, starter.id).toBe(true);
		}
	});

	it('cast everyone into the part written for them', () => {
		for (const starter of DAYDREAM_STARTERS) {
			const setup = starterSetup(starter);
			expect(setup.characters.length, starter.id).toBe(starter.cast.length);
			for (const copy of setup.characters) {
				expect(copy.casting.partId, `${starter.id}: ${copy.name}`).not.toBeNull();
			}
		}
	});

	it('keep the voice they were made with, and the scene’s order by heat', () => {
		for (const starter of DAYDREAM_STARTERS) {
			const preset = DAYDREAM_VOICE_PRESETS.find((candidate) => candidate.id === starter.voice);
			expect(starterSetup(starter).voice, starter.id).toMatchObject(preset?.voice ?? {});
		}
		const order = SCENE_TEMPLATES.map((template) => template.id);
		const used = DAYDREAM_STARTERS.map((starter) => order.indexOf(starterScene(starter).id));
		expect(used).toEqual([...used].sort((a, b) => a - b));
	});

	it('are copies from no library, made fresh each time', () => {
		const [first] = DAYDREAM_STARTERS;
		if (!first) {
			throw new Error('no starters');
		}
		const one = starterSetup(first);
		const two = starterSetup(first);
		expect(one.scene).toMatchObject({ sourceId: null, sourceRevision: null });
		expect(one.characters[0]).toMatchObject({ sourceId: null, sourceRevision: null });
		expect(one.scene.parts[0]?.id).not.toBe(two.scene.parts[0]?.id);
	});

	it('offers ideas that toggle as chips: short, and with no separator in them', () => {
		for (const chip of DAYDREAM_IDEA_CHIPS) {
			expect(chip.length).toBeLessThanOrEqual(60);
			expect(chip).not.toMatch(/[,\n]/);
		}
	});
});

describe('assembleSetup', () => {
	it('gives the parts ids and casts each person into the one named for them, ignoring case', () => {
		const setup = assembleSetup(pieces(), counter());
		expect(setup.scene.parts.map((part) => part.id)).toEqual(['id-1', 'id-2']);
		expect(setup.characters[0]?.casting).toEqual({ partId: 'id-1', relationship: 'r', part: 'd' });
		expect(setup).toMatchObject({ title: '', lead: 'character', limits: '' });
	});

	it('casts a part once, and someone naming a part that is not there in none', () => {
		const setup = assembleSetup(
			pieces({
				cast: [
					{ character: character('Ash'), partName: 'the stranger', relationship: '', doing: '' },
					{ character: character('Bel'), partName: 'the stranger', relationship: '', doing: '' },
					{ character: character('Cy'), partName: 'the conductor', relationship: '', doing: '' }
				]
			}),
			counter()
		);
		expect(setup.characters.map((copy) => copy.casting.partId)).toEqual(['id-1', null, null]);
		expect(daydreamSetupFormSchema.safeParse(setup).success).toBe(true);
	});

	it('follows who is in it when no voice is given, or the given one cannot work', () => {
		expect(assembleSetup(pieces({ voice: null })).voice.narrator).toBe('none');
		expect(assembleSetup(pieces({ voice: null, cast: [] })).voice.narrator).toBe('second-person');
		// Watching nobody cannot work, so it is told to you instead.
		expect(assembleSetup(pieces({ voice: 'watch', cast: [] })).voice).toMatchObject({
			narrator: 'second-person',
			stance: 'self'
		});
	});

	it('keeps no more people than a daydream holds', () => {
		const many = Array.from({ length: 7 }, (_, at) => ({
			character: { ...character(`P${at}`), dials: UNSET_CHARACTER_DIALS },
			partName: null,
			relationship: '',
			doing: ''
		}));
		expect(assembleSetup(pieces({ cast: many })).characters).toHaveLength(4);
	});
});
