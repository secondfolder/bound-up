import { describe, expect, it } from 'vitest';
import { MAX_NAMING_OPENING } from '$lib/daydream/suggestions';
import {
	buildSuggestMessages,
	SUGGEST_RULES,
	type SuggestRequest,
	suggestRequestSchema
} from './suggest-prompt';

const casting: SuggestRequest = {
	task: 'casting',
	character: { name: 'Mara', archetype: 'strict mentor', personality: 'calm' },
	scene: {
		title: 'After hours',
		premise: 'an interview that goes off script',
		yourRole: 'the new hire'
	},
	part: { name: 'the interviewer', description: 'runs the interview' },
	others: [{ name: 'Jun', part: 'the observer' }],
	stance: 'self',
	limits: 'Nothing public.'
};

const naming: SuggestRequest = {
	task: 'name',
	scene: { title: 'After hours', premise: 'an interview that goes off script' },
	characters: ['Mara'],
	opening: 'The door clicks shut behind you.',
	limits: 'Nothing public.'
};

const base: SuggestRequest = {
	task: 'chips',
	target: 'character',
	field: 'personality',
	draft: { name: 'Mara', personality: 'calm' },
	context: { characters: [], limits: 'Nothing public.' }
};

describe('buildSuggestMessages', () => {
	it('puts the rules first, with the user’s limits beside them', () => {
		const { messages } = buildSuggestMessages(base);
		expect(messages[0]?.role).toBe('system');
		expect(messages[0]?.content.startsWith(SUGGEST_RULES)).toBe(true);
		expect(messages[0]?.content).toContain('Nothing public.');
		expect(SUGGEST_RULES).toContain('under 18');
		expect(SUGGEST_RULES).toContain('real, identifiable people');
	});

	it('asks for chips for one field, given what is written', () => {
		const { messages, maxTokens } = buildSuggestMessages(base);
		const ask = messages.at(-1)?.content ?? '';
		expect(ask).toContain('Name: Mara');
		expect(ask).toContain('Personality: calm');
		expect(ask).toContain('"Personality" field');
		expect(ask).toContain('{"chips"');
		expect(maxTokens).toBeLessThan(1000);
	});

	it('asks to fill only the empty fields', () => {
		const ask =
			buildSuggestMessages({ ...base, task: 'fill', field: undefined }).messages.at(-1)?.content ??
			'';
		expect(ask).toContain('"archetype"');
		expect(ask).not.toContain('"personality": "…"');
		expect(ask).toContain('Do not change the fields already written');
	});

	it('writes a whole scene from the characters for Surprise me', () => {
		const { messages } = buildSuggestMessages({
			task: 'surprise-scene',
			target: 'scene',
			draft: {},
			context: {
				characters: [{ name: 'Mara', archetype: 'strict mentor' }],
				limits: '',
				story: { intensity: 4, pace: 2, length: 'medium' }
			}
		});
		expect(messages[0]?.content).toContain('Mara (strict mentor)');
		expect(messages[0]?.content).toContain('Intensity: intense');
		expect(messages.at(-1)?.content).toContain('"premise"');
	});

	it('includes a character’s dials in words', () => {
		const ask =
			buildSuggestMessages({
				...base,
				dials: {
					tone: 'teasing',
					control: null,
					strictness: null,
					edge: 5,
					talk: null,
					libido: null,
					kink: null
				}
			}).messages.at(-1)?.content ?? '';
		expect(ask).toContain('playful and teasing');
		expect(ask).toContain('is cruel');
	});
});

describe('buildSuggestMessages, heat and kink', () => {
	const scene = {
		task: 'fill' as const,
		target: 'scene' as const,
		draft: { title: 'Late', premise: 'A meeting.' },
		context: { characters: [], limits: '' }
	};

	it('matches the level set, and suggests nothing sexual for a SFW scene', () => {
		expect(SUGGEST_RULES).not.toContain('erotic story');
		expect(SUGGEST_RULES).toContain('suggest nothing sexual for a scene set to SFW');
		const ask =
			buildSuggestMessages({ ...scene, sceneDials: { heat: 1, kink: 4 } }).messages.at(-1)
				?.content ?? '';
		expect(ask).toContain('Heat: SFW');
		expect(ask).toContain('Kink: heavy');
	});

	it('asks the model to rate only the dials left unset', () => {
		const ask =
			buildSuggestMessages({ ...scene, sceneDials: { heat: 3, kink: null } }).messages.at(-1)
				?.content ?? '';
		expect(ask).toContain('"kink": 1-5');
		expect(ask).not.toContain('"heat": 1-5');

		const surprise =
			buildSuggestMessages({ ...scene, task: 'surprise-scene', draft: {} }).messages.at(-1)
				?.content ?? '';
		expect(surprise).toContain('"heat": 1-5');
		expect(surprise).toContain('"kink": 1-5');
	});

	it('says a character’s libido and kink in words', () => {
		const ask =
			buildSuggestMessages({
				...base,
				dials: {
					tone: null,
					control: null,
					strictness: null,
					edge: null,
					talk: null,
					libido: 5,
					kink: 1
				}
			}).messages.at(-1)?.content ?? '';
		expect(ask).toContain('is slutty');
		expect(ask).toContain('has vanilla tastes');
	});

	it('holds the dials to 1 to 5', () => {
		expect(
			suggestRequestSchema.safeParse({ ...scene, sceneDials: { heat: 6, kink: null } }).success
		).toBe(false);
		expect(
			suggestRequestSchema.safeParse({ ...scene, sceneDials: { heat: 5, kink: null } }).success
		).toBe(true);
	});
});

describe('buildSuggestMessages, for scene parts', () => {
	it('asks for parts with a surprise scene', () => {
		const ask =
			buildSuggestMessages({
				task: 'surprise-scene',
				target: 'scene',
				draft: {},
				context: { characters: [], limits: '' }
			}).messages.at(-1)?.content ?? '';
		expect(ask).toContain('"parts": [{"name"');
	});

	it('asks for parts when filling in a scene with none, and not over ones it has', () => {
		const scene = (parts?: { name: string; description: string }[]) =>
			buildSuggestMessages({
				task: 'fill',
				target: 'scene',
				draft: { title: 'Late', ...(parts ? { parts } : {}) },
				context: { characters: [], limits: '' }
			}).messages.at(-1)?.content ?? '';
		expect(scene()).toContain('"parts"');
		const withParts = scene([{ name: 'the boss', description: 'runs it' }]);
		expect(withParts).not.toContain('"parts": [');
		expect(withParts).toContain('- the boss: runs it');
	});
});

describe('buildSuggestMessages, casting', () => {
	it('writes who a character is in this scene, from both, with the rules and limits first', () => {
		const { messages, maxTokens } = buildSuggestMessages(casting);
		expect(messages[0]?.content.startsWith(SUGGEST_RULES)).toBe(true);
		expect(messages[0]?.content).toContain('Nothing public.');
		const ask = messages.at(-1)?.content ?? '';
		expect(ask).toContain('Name: Mara');
		expect(ask).toContain('Personality: calm');
		expect(ask).toContain('Your part: the new hire');
		expect(ask).toContain('Mara plays the part of the interviewer: runs the interview.');
		expect(ask).toContain('Also in the story: Jun (the observer).');
		expect(ask).toContain('{"relationship": "…", "part": "…"}');
		expect(maxTokens).toBeLessThan(1000);
	});

	it('says when the user only watches, and when there is no part', () => {
		const ask =
			buildSuggestMessages({ ...casting, stance: 'absent', part: null, others: [] }).messages.at(-1)
				?.content ?? '';
		expect(ask).toContain('The user is not in the story');
		expect(ask).toContain('has no particular part');
		expect(ask).toContain('Nobody else is in the story.');
	});
});

describe('buildSuggestMessages, naming', () => {
	it('names the story from its scene and its opening', () => {
		const { messages, maxTokens } = buildSuggestMessages(naming);
		expect(messages[0]?.content.startsWith(SUGGEST_RULES)).toBe(true);
		const ask = messages.at(-1)?.content ?? '';
		expect(ask).toContain('The door clicks shut behind you.');
		expect(ask).toContain('"After hours"');
		expect(ask).toContain('With: Mara.');
		expect(ask).toContain('{"title": "…"}');
		expect(maxTokens).toBeLessThanOrEqual(100);
	});
});

describe('buildSuggestMessages, a whole daydream', () => {
	const daydream: SuggestRequest = {
		task: 'daydream',
		idea: 'a stranger on a night train',
		limits: 'Nothing public.'
	};

	it('sets the whole story up from what the user wrote, with the rules and limits first', () => {
		const { messages, maxTokens } = buildSuggestMessages(daydream);
		expect(messages[0]?.content).toContain(SUGGEST_RULES);
		expect(messages[0]?.content).toContain('Nothing public.');
		const ask = messages[1]?.content ?? '';
		expect(ask).toContain('a stranger on a night train');
		// The four voices, the scene with its parts and ratings, and the cast.
		for (const voice of ['"talk"', '"told"', '"watch"', '"rules"']) {
			expect(ask).toContain(voice);
		}
		expect(ask).toContain('"parts"');
		expect(ask).toContain('"heat"');
		expect(ask).toContain('"characters"');
		expect(maxTokens).toBeGreaterThan(1000);
	});

	it('accepts a sentence within its cap, and refuses an empty or a long one', () => {
		expect(suggestRequestSchema.safeParse(daydream).success).toBe(true);
		expect(suggestRequestSchema.safeParse({ ...daydream, idea: '   ' }).success).toBe(false);
		expect(suggestRequestSchema.safeParse({ ...daydream, idea: 'x'.repeat(501) }).success).toBe(
			false
		);
	});
});

describe('suggestRequestSchema', () => {
	it('accepts a reasonable casting or naming request', () => {
		expect(suggestRequestSchema.safeParse(casting).success).toBe(true);
		expect(suggestRequestSchema.safeParse(naming).success).toBe(true);
	});

	it('holds a casting request to its caps', () => {
		expect(
			suggestRequestSchema.safeParse({
				...casting,
				others: Array.from({ length: 4 }, () => ({ name: 'Jun', part: null }))
			}).success
		).toBe(false);
		expect(
			suggestRequestSchema.safeParse({
				...casting,
				part: { name: 'x'.repeat(61), description: '' }
			}).success
		).toBe(false);
	});

	it('takes only the start of an opening to name, and needs one', () => {
		expect(
			suggestRequestSchema.safeParse({ ...naming, opening: 'x'.repeat(MAX_NAMING_OPENING + 1) })
				.success
		).toBe(false);
		expect(suggestRequestSchema.safeParse({ ...naming, opening: '' }).success).toBe(false);
	});

	it('accepts a reasonable request', () => {
		expect(suggestRequestSchema.safeParse(base).success).toBe(true);
	});

	it('needs a field of the target’s own for chips, and a scene for a surprise', () => {
		expect(suggestRequestSchema.safeParse({ ...base, field: 'premise' }).success).toBe(false);
		expect(suggestRequestSchema.safeParse({ ...base, field: undefined }).success).toBe(false);
		expect(suggestRequestSchema.safeParse({ ...base, task: 'surprise-scene' }).success).toBe(false);
	});

	it('holds each field to its cap', () => {
		expect(
			suggestRequestSchema.safeParse({ ...base, draft: { name: 'x'.repeat(61) } }).success
		).toBe(false);
	});
});
