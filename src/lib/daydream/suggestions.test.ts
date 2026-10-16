import { describe, expect, it } from 'vitest';
import { completionJson, parseChips, parseFill, parseSurpriseScene } from './suggestions';

const completion = (content: string) => ({ choices: [{ message: { content } }] });

describe('completionJson', () => {
	it('reads the JSON inside a completion, fenced or not', () => {
		expect(completionJson(completion('{"chips": ["a"]}'))).toEqual({ chips: ['a'] });
		expect(completionJson(completion('```json\n{"chips": []}\n```'))).toEqual({ chips: [] });
	});

	it('is null for anything else', () => {
		expect(completionJson(completion('Sure! Here are some ideas'))).toBeNull();
		expect(completionJson({ error: 'no' })).toBeNull();
		expect(completionJson(null)).toBeNull();
	});
});

describe('parseChips', () => {
	it('keeps short, distinct phrases', () => {
		expect(
			parseChips({ chips: [' wry ', 'Wry', '', 42, 'a, b', 'x'.repeat(81), 'patient'] })
		).toEqual(['wry', 'patient']);
	});

	it('keeps at most twelve', () => {
		const chips = Array.from({ length: 20 }, (_, index) => `chip ${index}`);
		expect(parseChips({ chips })).toHaveLength(12);
	});

	it('is empty for the wrong shape', () => {
		expect(parseChips(['a'])).toEqual([]);
		expect(parseChips(null)).toEqual([]);
	});
});

describe('parseFill', () => {
	it('keeps the target’s own fields, within their caps', () => {
		expect(
			parseFill('character', {
				name: 'Mara',
				personality: ' calm ',
				premise: 'not a character field',
				speech: 7,
				appearance: 'x'.repeat(501)
			})
		).toEqual({ name: 'Mara', personality: 'calm' });
		expect(parseFill('scene', { premise: 'A bet', setting: '' })).toEqual({ premise: 'A bet' });
	});
});

describe('parseSurpriseScene', () => {
	it('needs a title and a premise', () => {
		expect(parseSurpriseScene({ title: 'T', premise: 'P', tone: 'tense' })).toEqual({
			title: 'T',
			setting: '',
			premise: 'P',
			yourRole: '',
			tone: 'tense',
			notes: ''
		});
		expect(parseSurpriseScene({ title: 'T' })).toBeNull();
	});
});
