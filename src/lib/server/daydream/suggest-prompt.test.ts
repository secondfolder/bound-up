import { describe, expect, it } from 'vitest';
import {
	buildSuggestMessages,
	SUGGEST_RULES,
	type SuggestRequest,
	suggestRequestSchema
} from './suggest-prompt';

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
				dials: { tone: 'teasing', control: null, strictness: null, edge: 5, talk: null }
			}).messages.at(-1)?.content ?? '';
		expect(ask).toContain('playful and teasing');
		expect(ask).toContain('is cruel');
	});
});

describe('suggestRequestSchema', () => {
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
