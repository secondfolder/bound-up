import { describe, expect, it } from 'vitest';
import {
	type Answer,
	answeredCount,
	effectiveAnswer,
	emptyList,
	type Filters,
	hasContent,
	interestOf,
	isAnswered,
	isPositive,
	isShown,
	isSplit,
	type ListPayload,
	listPayloadSchema,
	mergeLists,
	normaliseAnswer,
	searchView,
	settleSide,
	shownSides,
	withExperience,
	withInterest,
	withLevel
} from './answers';
import { childrenOf, detailOf, type KinkItem, kinkById } from './catalog';

function list(fields: Partial<ListPayload> = {}): ListPayload {
	return { ...emptyList(), ...fields };
}

const at = 1000;

describe('effectiveAnswer', () => {
	it('is the kink’s own answer when it has one', () => {
		const answers = { spanking: { level: 'like', at } } satisfies Record<string, Answer>;
		expect(effectiveAnswer(list({ answers }), 'spanking')).toEqual({
			level: 'like',
			detail: undefined,
			source: { kind: 'own' }
		});
	});

	it('takes a side’s own answer over the answer for both', () => {
		const answers = {
			kissing: { level: 'like', sides: { b: { level: 'love' } }, at }
		} satisfies Record<string, Answer>;
		expect(effectiveAnswer(list({ answers }), 'kissing', 'b').level).toBe('love');
		expect(effectiveAnswer(list({ answers }), 'kissing', 'a').level).toBe('like');
	});

	it('never gives a specific its kink’s answer', () => {
		const answers: Record<string, Answer> = { spanking: { level: 'love', at } };
		expect(effectiveAnswer(list({ answers }), 'spanking-implements')).toEqual({});
		answers['spanking-implements'] = { level: 'not-for-me', at };
		expect(effectiveAnswer(list({ answers }), 'spanking-implements')).toMatchObject({
			level: 'not-for-me',
			source: { kind: 'own' }
		});
	});

	it('never passes a kink’s answer down from its category', () => {
		const triage = { impact: { value: 'skip' as const, at } };
		expect(effectiveAnswer(list({ triage }), 'spanking')).toEqual({});
	});

	it('makes everything in a category a hard limit when the category says so', () => {
		const triage = { anal: { value: 'limit' as const, at } };
		expect(effectiveAnswer(list({ triage }), 'anal-sex')).toMatchObject({
			level: 'limit',
			source: { kind: 'category', categoryId: 'anal' }
		});
		// A specific two levels down too.
		expect(effectiveAnswer(list({ triage }), 'butt-plugs').level).toBe('limit');
	});

	it('leaves a related kink alone: only its own category passes anything to it', () => {
		// Rimming lives in Oral and is only also under Anal.
		const triage = { anal: { value: 'limit' as const, at } };
		expect(effectiveAnswer(list({ triage }), 'rimming')).toEqual({});
	});

	it('lets a kink’s own answer stand against its category’s hard limit', () => {
		const triage = { anal: { value: 'limit' as const, at } };
		const answers = { 'anal-sex': { level: 'curious', at } } satisfies Record<string, Answer>;
		expect(effectiveAnswer(list({ triage, answers }), 'anal-sex').level).toBe('curious');
	});
});

describe('mergeLists', () => {
	it('keeps whichever answer changed last, per kink', () => {
		const phone = list({
			answers: { spanking: { level: 'like', at: 1 }, caning: { level: 'love', at: 5 } }
		});
		const laptop = list({
			answers: { spanking: { level: 'love', at: 2 }, caning: { level: 'limit', at: 3 } }
		});
		const merged = mergeLists(phone, laptop);
		expect(merged.answers.spanking?.level).toBe('love');
		expect(merged.answers.caning?.level).toBe('love');
	});

	it('carries a clearing over an older answer', () => {
		const older = list({ answers: { spanking: { level: 'like', at: 1 } } });
		const cleared = list({ answers: { spanking: { at: 2 } } });
		const merged = mergeLists(older, cleared);
		expect(isAnswered(merged.answers.spanking)).toBe(false);
		expect(hasContent(merged.answers.spanking)).toBe(false);
	});

	it('merges triage and settings the same way', () => {
		const a = list({
			triage: { media: { value: 'skip', at: 1 } },
			settings: { detail: 5, side: 'both', at: 9 }
		});
		const b = list({
			triage: { media: { value: 'none', at: 2 } },
			settings: { detail: 2, side: 'both', at: 4 }
		});
		const merged = mergeLists(a, b);
		expect(merged.triage.media?.value).toBe('none');
		expect(merged.settings.detail).toBe(5);
	});
});

describe('the stored shape', () => {
	it('accepts a list with every kind of answer', () => {
		const parsed = listPayloadSchema.safeParse({
			answers: {
				spanking: { level: 'like', note: 'Over the knee', at },
				rimming: {
					sides: { a: { level: 'curious', detail: { doing: 'like', experience: 2 } } },
					at
				},
				kissing: { level: 'conditional', at }
			},
			triage: { extreme: { value: 'limit', at } },
			settings: { detail: 3, side: 'both', at },
			skipped: { tickling: { skipped: true, at } }
		});
		expect(parsed.success).toBe(true);
	});

	it('drops the own kinks a list saved in development may still hold', () => {
		const parsed = listPayloadSchema.parse({
			...emptyList(),
			answers: {
				spanking: { level: 'like', at },
				'custom:0123456789abcdef': { level: 'love', at }
			},
			custom: { 'custom:0123456789abcdef': { name: 'Being read to', categoryId: 'intimacy', at } },
			skipped: { 'custom:0123456789abcdef': { skipped: true, at } }
		});
		expect(Object.keys(parsed.answers)).toEqual(['spanking']);
		expect(parsed.skipped).toEqual({});
		expect(parsed).not.toHaveProperty('custom');
	});

	it('refuses a key that is not a catalogue id', () => {
		const parsed = listPayloadSchema.safeParse({
			...emptyList(),
			answers: { 'Not An Id': { level: 'like', at } }
		});
		expect(parsed.success).toBe(false);
	});

	it('refuses a slider outside 0–4 and a level that does not exist', () => {
		const bad = (answer: unknown) =>
			listPayloadSchema.safeParse({ ...emptyList(), answers: { spanking: answer } }).success;
		expect(bad({ detail: { fantasy: 5 }, at })).toBe(false);
		expect(bad({ level: 'maybe', at })).toBe(false);
	});
});

describe('small rules', () => {
	it('counts conditional and curious as yes, and don’t mind as not', () => {
		expect(isPositive('conditional')).toBe(true);
		expect(isPositive('curious')).toBe(true);
		expect(isPositive('dont-mind')).toBe(false);
		expect(isPositive(undefined)).toBe(false);
	});

	it('counts a kink answered on one side as answered, and a note alone as not', () => {
		const answers: Record<string, Answer> = {
			kissing: { sides: { a: { level: 'like' } }, at },
			spanking: { note: 'Ask me first', at }
		};
		expect(answeredCount(list({ answers }))).toBe(1);
		expect(hasContent(answers.spanking)).toBe(true);
	});
});

describe('fantasy and reality', () => {
	it('are the answer until they part', () => {
		const side = withLevel(undefined, 'like');
		expect(side).toEqual({ level: 'like' });
		expect(interestOf(side)).toEqual({ fantasy: 'like', doing: 'like' });
		expect(isSplit(side)).toBe(false);
	});

	it('part when one changes, and the answer follows reality', () => {
		const side = withInterest({ level: 'like' }, 'fantasy', 'love');
		expect(side).toEqual({ level: 'like', detail: { fantasy: 'love', doing: 'like' } });
		expect(isSplit(side)).toBe(true);
	});

	it('follow fantasy while reality is unsaid', () => {
		expect(withInterest(undefined, 'fantasy', 'love')).toEqual({
			level: 'love',
			detail: { fantasy: 'love' }
		});
		expect(interestOf({ level: 'love', detail: { fantasy: 'love' } })).toEqual({
			fantasy: 'love',
			doing: undefined
		});
	});

	it('fold back into one answer when they agree again', () => {
		const apart = withInterest({ level: 'like' }, 'fantasy', 'love');
		expect(withInterest(apart, 'doing', 'love')).toEqual({ level: 'love' });
	});

	it('follow the answer again when it is set as a whole, keeping experience', () => {
		const apart = {
			level: 'like',
			detail: { fantasy: 'love', doing: 'like', experience: 2 }
		} as const;
		expect(withLevel(apart, 'curious')).toEqual({ level: 'curious', detail: { experience: 2 } });
		expect(withExperience({ level: 'like' }, 1)).toEqual({
			level: 'like',
			detail: { experience: 1 }
		});
	});

	it('read the 0–4 numbers lists saved in development hold as the nearest level', () => {
		const parsed = listPayloadSchema.parse({
			...emptyList(),
			answers: { romance: { level: 'like', detail: { fantasy: 4, doing: 2 }, at } }
		});
		expect(parsed.answers.romance).toEqual({
			level: 'like',
			detail: { fantasy: 'love', doing: 'like' },
			at
		});
	});

	it('settle as a list is read, so a stored answer is always in one of its two shapes', () => {
		expect(settleSide({ level: 'love', detail: { fantasy: 'like', doing: 'like' } })).toEqual({
			level: 'like'
		});
		expect(
			normaliseAnswer('romance', { level: 'like', detail: { fantasy: 'love', doing: 'like' }, at })
		).toEqual({ level: 'like', detail: { fantasy: 'love', doing: 'like' }, at });
	});
});

describe('the shape of an answer', () => {
	it('splits a whole answer on a role kink into the same answer on each side', () => {
		expect(
			normaliseAnswer('spanking', { level: 'like', detail: { experience: 3 }, note: 'Hard', at })
		).toEqual({
			sides: {
				a: { level: 'like', detail: { experience: 3 } },
				b: { level: 'like', detail: { experience: 3 } }
			},
			note: 'Hard',
			at
		});
	});

	it('keeps a side already answered when a whole answer is laid over it', () => {
		expect(
			normaliseAnswer('spanking', { level: 'like', sides: { b: { level: 'limit' } }, at })
		).toEqual({ sides: { a: { level: 'like' }, b: { level: 'limit' } }, at });
	});

	it('answers a kink without a role pair whole, from its first side', () => {
		expect(normaliseAnswer('romance', { sides: { a: { level: 'love' } }, at })).toEqual({
			level: 'love',
			at
		});
	});

	it('normalises every answer as a list is read, and fills in settings it did not have', () => {
		const parsed = listPayloadSchema.parse({
			...emptyList(),
			answers: { spanking: { level: 'love', at } },
			settings: { maxIntensity: 5, at }
		});
		expect(parsed.answers.spanking).toEqual({
			sides: { a: { level: 'love' }, b: { level: 'love' } },
			at
		});
		expect(parsed.settings).toEqual({ detail: 4, side: 'both', at });
	});
});

describe('the filters', () => {
	const filters = (fields: Partial<Filters> = {}): Filters => ({
		detail: 5,
		side: 'both',
		...fields
	});
	const spanking = kinkById('spanking') as KinkItem;

	it('hides what sits past the level of detail', () => {
		// Common, so it shows from level 2.
		expect(isShown(spanking, filters({ detail: 2 }))).toBe(true);
		expect(isShown(spanking, filters({ detail: 1 }))).toBe(false);
	});

	it('shows only one level in debug mode’s exact mode, with the kinks its specifics need', () => {
		const level = detailOf(spanking);
		const [specific] = childrenOf('spanking').filter((child) => detailOf(child) > level);
		if (!specific) {
			throw new Error('a finer specific of spanking');
		}
		const only = (detail: number) => filters({ detail, exactDetail: true });
		expect(isShown(spanking, only(level))).toBe(true);
		expect(isShown(specific, only(level))).toBe(false);
		// The specific's own level keeps spanking, which it shows under.
		expect(isShown(specific, only(detailOf(specific)))).toBe(true);
		expect(isShown(spanking, only(detailOf(specific)))).toBe(true);
		// Below its own level, nothing under it reaches back.
		expect(isShown(spanking, only(level - 1))).toBe(false);
	});

	it('hides a one-sided kink from the other side only', () => {
		const domOnly = { ...spanking, roles: undefined, domSide: undefined, lean: 'dom' } as KinkItem;
		expect(isShown(domOnly, filters({ side: 'dom' }))).toBe(true);
		expect(isShown(domOnly, filters({ side: 'both' }))).toBe(true);
		expect(isShown(domOnly, filters({ side: 'sub' }))).toBe(false);
	});

	it('narrows a leaning role kink to your own context, and leaves a neutral one whole', () => {
		// A dom spanks; a sub is spanked.
		expect(shownSides(spanking, 'both')).toEqual(['a', 'b']);
		expect(shownSides(spanking, 'dom')).toEqual(['a']);
		expect(shownSides(spanking, 'sub')).toEqual(['b']);
		// Giving worship is the sub's side.
		expect(shownSides(kinkById('genital-worship'), 'sub')).toEqual(['a']);
		expect(shownSides(kinkById('kissing'), 'sub')).toEqual(['a', 'b']);
		expect(shownSides(kinkById('romance'), 'sub')).toBeNull();
	});
});

describe('searchView', () => {
	const everything: Filters = { detail: 5, side: 'both' };

	it('is nothing for an empty search', () => {
		expect(searchView('  ', everything)).toBeNull();
	});

	it('shows a matching specific under its kink', () => {
		const view = searchView('paddle', everything);
		expect(view?.shown).toEqual(new Set(['spanking-implements', 'spanking']));
	});

	it('does not bring a matching kink’s specifics along', () => {
		const view = searchView('fellatio', everything);
		expect(view?.shown.has('blowjobs')).toBe(true);
		expect(view?.shown.has('deepthroat')).toBe(false);
	});

	it('counts the matches the filters hide, including a specific whose kink they hide', () => {
		expect(searchView('paddle', { ...everything, detail: 3 })).toEqual({
			shown: new Set(),
			hidden: 1
		});
		expect(searchView('paddle', { ...everything, detail: 1 })?.hidden).toBe(1);
	});
});
