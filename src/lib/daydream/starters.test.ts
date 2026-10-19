import { describe, expect, it } from 'vitest';
import { DAYDREAM_VOICE_PRESETS, UNSET_CHARACTER_DIALS } from '../daydream';
import { daydreamSetupFormSchema } from '../schemas/daydreamForm';
import { CHARACTER_TEMPLATES, SCENE_TEMPLATES } from './catalog';
import {
	assembleSetup,
	DAYDREAM_IDEA_CHIPS,
	DAYDREAM_STARTERS,
	pickIdeas,
	SHOWN_IDEA_CHIPS,
	type StoryPieces,
	starterScene,
	starterSetup,
	startersFor
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

	it('each carries a few short tags, none twice', () => {
		for (const starter of DAYDREAM_STARTERS) {
			expect(starter.tags.length, starter.id).toBeGreaterThan(0);
			expect(starter.tags.length, starter.id).toBeLessThanOrEqual(4);
			expect(new Set(starter.tags).size, starter.id).toBe(starter.tags.length);
			for (const tag of starter.tags) {
				expect(tag.length, `${starter.id}: ${tag}`).toBeLessThanOrEqual(20);
			}
		}
	});

	it('offers ideas that toggle as chips: short, and with no separator in them', () => {
		for (const chip of DAYDREAM_IDEA_CHIPS) {
			expect(chip.length).toBeLessThanOrEqual(60);
			expect(chip).not.toMatch(/[,\n]/);
		}
	});
});

describe('startersFor', () => {
	it('shows every story for either side', () => {
		expect(startersFor(null)).toEqual(DAYDREAM_STARTERS);
	});

	it('shows a side its own stories and those with no one in charge, never the other side’s', () => {
		for (const [side, other] of [
			['dom', 'sub'],
			['sub', 'dom']
		] as const) {
			const shown = startersFor(side);
			expect(shown.filter((starter) => starter.you === side).length, side).toBeGreaterThan(5);
			expect(
				shown.some((starter) => starter.you === other),
				side
			).toBe(false);
			expect(shown.filter((starter) => starter.you === null)).toEqual(
				DAYDREAM_STARTERS.filter((starter) => starter.you === null)
			);
		}
	});
});

describe('the two sides', () => {
	// Every story with a side has a version from the other side, so neither
	// filter is the poor relation.
	it('have as many stories as each other', () => {
		const count = (side: 'dom' | 'sub') =>
			DAYDREAM_STARTERS.filter((starter) => starter.you === side).length;
		expect(count('dom')).toBe(count('sub'));
	});
});

describe('pickIdeas', () => {
	it('draws a few different ideas from the list', () => {
		const picked = pickIdeas();
		expect(picked).toHaveLength(SHOWN_IDEA_CHIPS);
		expect(new Set(picked).size).toBe(SHOWN_IDEA_CHIPS);
		for (const idea of picked) {
			expect(DAYDREAM_IDEA_CHIPS).toContain(idea);
		}
		expect(DAYDREAM_IDEA_CHIPS.length).toBeGreaterThan(SHOWN_IDEA_CHIPS);
	});

	it('draws others than the ones on screen, and never fewer than asked for', () => {
		const shown = pickIdeas();
		for (let draw = 0; draw < 20; draw += 1) {
			const next = pickIdeas(SHOWN_IDEA_CHIPS, Math.random, shown);
			expect(next).toHaveLength(SHOWN_IDEA_CHIPS);
			expect(next.filter((idea) => shown.includes(idea))).toEqual([]);
		}
		const almostAll = DAYDREAM_IDEA_CHIPS.slice(1);
		expect(pickIdeas(SHOWN_IDEA_CHIPS, Math.random, almostAll)).toHaveLength(SHOWN_IDEA_CHIPS);
	});

	it('draws differently with different luck', () => {
		const always = (value: number) => () => value;
		expect(pickIdeas(SHOWN_IDEA_CHIPS, always(0))).not.toEqual(
			pickIdeas(SHOWN_IDEA_CHIPS, always(0.999))
		);
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
