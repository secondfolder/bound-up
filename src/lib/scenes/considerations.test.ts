import { describe, expect, it } from 'vitest';
import {
	type Consideration,
	considerationProblems,
	considerations,
	considerationsSchema,
	insertText,
	isRelevant,
	type Mentioned,
	NOTHING_MENTIONED,
	type PromptOutcome,
	stepLevel,
	visibleConsiderations
} from './considerations';
import data from './considerations.json' with { type: 'json' };

function mentioning(kinkIds: string[], tags: string[] = [], maxIntensity = -1): Mentioned {
	return { kinkIds: new Set(kinkIds), tags: new Set(tags), maxIntensity };
}

function entry(overrides: Partial<Consideration> = {}): Consideration {
	return {
		id: 'example',
		type: 'think',
		group: 'want',
		level: 1,
		title: 'A title',
		why: 'A reason.',
		insert: { section: 'notes', text: 'Something: ' },
		...overrides
	};
}

const none = new Map<string, PromptOutcome>();

describe('considerations.json', () => {
	it('parses', () => {
		expect(considerationsSchema.safeParse(data).success).toBe(true);
	});

	/** The page's most basic safety question must be there at the lowest step. */
	it('asks how you will stop at the first level, always', () => {
		const stop = considerations.find((item) => item.id === 'how-will-you-stop');
		expect(stop).toMatchObject({ level: 1 });
		expect(stop?.when).toBeUndefined();
	});
});

describe('considerationProblems', () => {
	it('finds duplicate ids', () => {
		expect(considerationProblems([entry(), entry()])).toEqual(['duplicate id "example"']);
	});

	it('finds kinks and tags the catalogue does not have', () => {
		expect(
			considerationProblems([entry({ when: { kinks: ['no-such-kink'], tags: ['no-such-tag'] } })])
		).toEqual([
			'"example" names an unknown kink "no-such-kink"',
			'"example" names an unknown tag "no-such-tag"'
		]);
	});

	it('refuses a question with no answers, and one that ignores its answer', () => {
		const bad = { ...data, considerations: [entry({ type: 'ask' })] };
		expect(considerationsSchema.safeParse(bad).success).toBe(false);
		const ignored = {
			...data,
			considerations: [entry({ type: 'ask', answers: ['Yes', 'No'] })]
		};
		expect(considerationsSchema.safeParse(ignored).success).toBe(false);
	});
});

describe('isRelevant', () => {
	it('is always relevant with no condition', () => {
		expect(isRelevant(entry(), NOTHING_MENTIONED)).toBe(true);
	});

	it('waits for a kink, a tag or an intensity the page mentions', () => {
		const gag = entry({ when: { kinks: ['gags'] } });
		expect(isRelevant(gag, NOTHING_MENTIONED)).toBe(false);
		expect(isRelevant(gag, mentioning(['gags']))).toBe(true);

		const risky = entry({ when: { tags: ['risky'] } });
		expect(isRelevant(risky, mentioning(['choking'], ['risky']))).toBe(true);

		const intense = entry({ when: { minIntensity: 3 } });
		expect(isRelevant(intense, mentioning(['spanking'], [], 2))).toBe(false);
		expect(isRelevant(intense, mentioning(['spanking-implements'], [], 3))).toBe(true);
	});
});

describe('visibleConsiderations', () => {
	const base = { mentioned: NOTHING_MENTIONED, outcomes: none, neverShow: new Set<string>() };

	it('shows more as the level goes up', () => {
		const few = visibleConsiderations('think', { ...base, level: 1 });
		const more = visibleConsiderations('think', { ...base, level: 5 });
		expect(few.length).toBeGreaterThan(0);
		expect(more.length).toBeGreaterThan(few.length);
		expect(few.every((item) => item.level <= 1 && item.type === 'think')).toBe(true);
	});

	it('shows nothing at level 0', () => {
		expect(visibleConsiderations('ask', { ...base, level: 0 })).toEqual([]);
	});

	it('leaves out what this scene dealt with and what this person never wants', () => {
		const outcomes = new Map<string, PromptOutcome>([['limits-tonight', 'handled']]);
		const neverShow = new Set(['aftercare-needs']);
		const ids = visibleConsiderations('think', { ...base, level: 5, outcomes, neverShow }).map(
			(item) => item.id
		);
		expect(ids).not.toContain('limits-tonight');
		expect(ids).not.toContain('aftercare-needs');
		expect(ids).toContain('what-are-you-craving');
	});

	it('brings in a prompt once the page mentions what it is about', () => {
		const before = visibleConsiderations('think', { ...base, level: 5 }).map((item) => item.id);
		const after = visibleConsiderations('think', {
			...base,
			level: 5,
			mentioned: mentioning(['gags', 'bondage'])
		}).map((item) => item.id);
		expect(before).not.toContain('without-words');
		expect(after).toContain('without-words');
	});
});

describe('insertText', () => {
	it('puts the answer in', () => {
		const stop = entry({ type: 'ask', insert: { section: 'signals', text: 'To stop: {answer}' } });
		expect(insertText(stop, ' Red ')).toBe('To stop: Red');
		expect(insertText(stop)).toBe('To stop: ');
	});
});

describe('stepLevel', () => {
	it('stays between hidden and everything', () => {
		expect(stepLevel(0, -1)).toBe(0);
		expect(stepLevel(5, 1)).toBe(5);
		expect(stepLevel(2, 1)).toBe(3);
	});
});
