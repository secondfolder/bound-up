import { describe, expect, it } from 'vitest';
import {
	type Answer,
	answeredCount,
	effectiveAnswer,
	emptyList,
	hasContent,
	isAnswered,
	isPositive,
	type ListPayload,
	listPayloadSchema,
	mergeLists,
	newCustomKey
} from './answers';

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

	it('gives a specific its kink’s answer until it has one of its own', () => {
		const answers: Record<string, Answer> = { spanking: { level: 'love', at } };
		expect(effectiveAnswer(list({ answers }), 'spanking-implements')).toMatchObject({
			level: 'love',
			source: { kind: 'parent', itemId: 'spanking' }
		});
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

	it('applies a category’s hard limit to custom kinks added to it', () => {
		const key = newCustomKey();
		const custom = { [key]: { name: 'Mine', categoryId: 'anal', at } };
		const triage = { anal: { value: 'limit' as const, at } };
		expect(effectiveAnswer(list({ custom, triage }), key).level).toBe('limit');
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

	it('merges custom kinks, triage and settings the same way', () => {
		const a = list({
			triage: { media: { value: 'skip', at: 1 } },
			settings: { maxIntensity: 6, at: 9 }
		});
		const b = list({
			triage: { media: { value: 'none', at: 2 } },
			settings: { maxIntensity: 3, at: 4 }
		});
		const merged = mergeLists(a, b);
		expect(merged.triage.media?.value).toBe('none');
		expect(merged.settings.maxIntensity).toBe(6);
	});
});

describe('the stored shape', () => {
	it('accepts a list with every kind of answer', () => {
		const key = newCustomKey();
		const parsed = listPayloadSchema.safeParse({
			answers: {
				spanking: { level: 'like', note: 'Over the knee', at },
				rimming: { sides: { a: { level: 'curious', detail: { doing: 2 } } }, at },
				[key]: { level: 'conditional', at }
			},
			triage: { extreme: { value: 'limit', at } },
			custom: { [key]: { name: 'Being read to', categoryId: 'intimacy', at } },
			settings: { maxIntensity: 5, at },
			skipped: { tickling: { skipped: true, at } }
		});
		expect(parsed.success).toBe(true);
	});

	it('refuses a key that is neither a catalogue id nor a custom kink', () => {
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

	it('makes custom keys that the schema accepts', () => {
		const key = newCustomKey();
		expect(key).toMatch(/^custom:[0-9a-f]{24}$/);
	});
});
