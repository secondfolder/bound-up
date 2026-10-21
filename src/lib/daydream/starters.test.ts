import { describe, expect, it } from 'vitest';
import {
	DAYDREAM_VOICE_PRESETS,
	fieldsFrom,
	IDEA_FIELD_KINDS,
	UNSET_CHARACTER_DIALS
} from '../daydream';
import { daydreamSetupFormSchema } from '../schemas/daydreamForm';
import { CHARACTER_TEMPLATES, IDEA_TEMPLATES } from './catalog';
import {
	assembleSetup,
	DAYDREAM_STARTERS,
	type DaydreamPieces,
	forSide,
	inOrder,
	matchesSearch,
	shuffledStarterIds,
	starterIdea,
	starterSetup,
	starterSummary,
	startersFor,
	storedStarterSide
} from './starters';
import { setupSummary, TOLD_AS } from './summary';

/** Ids that say which part they are, so a test can read a casting. */
function counter() {
	let next = 0;
	return () => {
		next += 1;
		return `id-${next}`;
	};
}

const character = (name: string) => ({ ...CHARACTER_TEMPLATES[0].character, name });

const pieces = (overrides: Partial<DaydreamPieces> = {}): DaydreamPieces => ({
	voice: 'talk',
	idea: {
		title: 'The night train',
		premise: 'A stranger takes the seat across from you.',
		yourRole: 'a passenger',
		fields: fieldsFrom(IDEA_FIELD_KINDS, { setting: 'a sleeper carriage', tone: 'mysterious' }),
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

describe('the ready-made daydreams', () => {
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

	it('keep the voice they were made with, and the idea’s order by heat', () => {
		for (const starter of DAYDREAM_STARTERS) {
			const preset = DAYDREAM_VOICE_PRESETS.find((candidate) => candidate.id === starter.voice);
			expect(starterSetup(starter).voice, starter.id).toMatchObject(preset?.voice ?? {});
		}
		const order = IDEA_TEMPLATES.map((template) => template.id);
		const used = DAYDREAM_STARTERS.map((starter) => order.indexOf(starterIdea(starter).id));
		expect(used).toEqual([...used].sort((a, b) => a - b));
	});

	it('are copies from no library, made fresh each time', () => {
		const [first] = DAYDREAM_STARTERS;
		if (!first) {
			throw new Error('no starters');
		}
		const one = starterSetup(first);
		const two = starterSetup(first);
		expect(one.idea).toMatchObject({ sourceId: null, sourceRevision: null });
		expect(one.characters[0]).toMatchObject({ sourceId: null, sourceRevision: null });
		expect(one.idea.parts[0]?.id).not.toBe(two.idea.parts[0]?.id);
	});

	it('each has a summary with every piece of it marked, so nothing is said after it', () => {
		for (const starter of DAYDREAM_STARTERS) {
			const setup = starterSetup(starter);
			const marked = starterSummary(starter, setup);
			expect(marked, starter.id).not.toBeNull();
			// Every marker became a blank: none named someone who is not in it.
			const slots = marked?.filter((piece) => piece.kind === 'slot') ?? [];
			expect(slots, starter.id).toHaveLength(starter.summary.split('[[').length - 1);
			expect(
				setupSummary(setup, marked ? { marked, draft: setup } : null),
				starter.id
			).toHaveLength(1);
		}
	});

	it('each opens with the story as a whole and closes by saying how it is told', () => {
		for (const starter of DAYDREAM_STARTERS) {
			const marked = starterSummary(starter, starterSetup(starter)) ?? [];
			expect(marked[0], starter.id).toMatchObject({ kind: 'slot', slot: { kind: 'idea' } });
			expect(marked.at(-2), starter.id).toEqual({
				kind: 'slot',
				slot: { kind: 'voice' },
				words: TOLD_AS[starter.voice],
				key: 'voice'
			});
		}
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
});

describe('shuffledStarterIds', () => {
	const ids = DAYDREAM_STARTERS.map((starter) => starter.id);

	it('names every ready-made daydream once', () => {
		expect([...shuffledStarterIds()].sort()).toEqual([...ids].sort());
	});

	it('draws a different order with different luck', () => {
		const always = (value: number) => () => value;
		expect(shuffledStarterIds(always(0))).not.toEqual(shuffledStarterIds(always(0.999)));
	});
});

describe('inOrder', () => {
	it('puts the stories in the order given, and any it does not name last', () => {
		const stories = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		expect(inOrder(stories, ['c', 'a', 'b']).map((story) => story.id)).toEqual(['c', 'a', 'b']);
		expect(inOrder(stories, ['b']).map((story) => story.id)).toEqual(['b', 'a', 'c']);
	});
});

describe('matchesSearch', () => {
	const story = {
		title: 'Late at the office',
		premise: 'Your boss keeps you after everyone has gone.',
		tags: ['brat', 'workplace']
	};

	it('finds every word somewhere in the title, premise or tags, ignoring case', () => {
		expect(matchesSearch(story, 'OFFICE')).toBe(true);
		expect(matchesSearch(story, 'boss')).toBe(true);
		expect(matchesSearch(story, 'brat office')).toBe(true);
		expect(matchesSearch(story, 'workpl')).toBe(true);
	});

	it('misses when any word is nowhere in it', () => {
		expect(matchesSearch(story, 'brat dungeon')).toBe(false);
	});

	it('matches everything when nothing is typed', () => {
		expect(matchesSearch(story, '')).toBe(true);
		expect(matchesSearch(story, '   ')).toBe(true);
	});
});

describe('storedStarterSide', () => {
	it('reads back a remembered side', () => {
		expect(storedStarterSide('dom')).toBe('dom');
		expect(storedStarterSide('sub')).toBe('sub');
	});

	it('falls back to either for nothing stored or anything it does not know', () => {
		for (const stored of [null, '', 'either', 'switch', 'Dom']) {
			expect(storedStarterSide(stored), String(stored)).toBe(null);
		}
	});
});

describe('forSide', () => {
	it('filters anything with a side the way the ready-made daydreams are', () => {
		const ideas = [
			{ title: 'a', you: 'dom' },
			{ title: 'b', you: 'sub' },
			{ title: 'c', you: null }
		] as const;
		expect(forSide(ideas, null)).toEqual(ideas);
		expect(forSide(ideas, 'dom').map((idea) => idea.title)).toEqual(['a', 'c']);
		expect(forSide(ideas, 'sub').map((idea) => idea.title)).toEqual(['b', 'c']);
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

describe('assembleSetup', () => {
	it('gives the parts ids and casts each person into the one named for them, ignoring case', () => {
		const setup = assembleSetup(pieces(), counter());
		expect(setup.idea.parts.map((part) => part.id)).toEqual(['id-1', 'id-2']);
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
