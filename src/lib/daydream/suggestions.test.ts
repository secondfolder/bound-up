import { describe, expect, it } from 'vitest';
import {
	completionJson,
	parseCasting,
	parseChips,
	parseFill,
	parseName,
	parseParts,
	parseSceneDials,
	parseSurpriseScene
} from './suggestions';

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
			notes: '',
			parts: [],
			dials: { heat: null, kink: null }
		});
		expect(parseSurpriseScene({ title: 'T' })).toBeNull();
	});

	it('keeps a heat and kink it rated, and leaves out what is not a dial', () => {
		expect(parseSurpriseScene({ title: 'T', premise: 'P', heat: 5, kink: 2 })?.dials).toEqual({
			heat: 5,
			kink: 2
		});
		expect(parseSurpriseScene({ title: 'T', premise: 'P', heat: 9, kink: 2.5 })?.dials).toEqual({
			heat: null,
			kink: null
		});
	});

	it('keeps the parts it came with', () => {
		expect(
			parseSurpriseScene({ title: 'T', premise: 'P', parts: [{ name: 'the host' }] })?.parts
		).toEqual([{ name: 'the host', description: '' }]);
	});
});

describe('parseSceneDials', () => {
	it('takes whole numbers from 1 to 5, and nothing else', () => {
		expect(parseSceneDials({ heat: 1, kink: 5 })).toEqual({ heat: 1, kink: 5 });
		expect(parseSceneDials({ heat: 0, kink: '3' })).toEqual({ heat: null, kink: null });
		expect(parseSceneDials(null)).toEqual({ heat: null, kink: null });
	});
});

describe('parseParts', () => {
	it('keeps named parts within their caps, once each, at most four', () => {
		expect(
			parseParts({
				parts: [
					{ name: ' the host ', description: ' runs it ' },
					{ name: 'The Host', description: 'again' },
					{ name: '', description: 'nobody' },
					{ name: 'x'.repeat(61) },
					{ name: 'the guest', description: 'y'.repeat(301) },
					'the butler',
					{ name: 'a' },
					{ name: 'b' },
					{ name: 'c' }
				]
			})
		).toEqual([
			{ name: 'the host', description: 'runs it' },
			// A description over its cap is dropped, not the part.
			{ name: 'the guest', description: '' },
			{ name: 'a', description: '' },
			{ name: 'b', description: '' }
		]);
	});

	it('is empty for anything that is not a list of parts', () => {
		expect(parseParts({ parts: 'the host' })).toEqual([]);
		expect(parseParts(null)).toEqual([]);
	});
});

describe('parseCasting', () => {
	it('keeps each field that fits, and is null when neither does', () => {
		expect(parseCasting({ relationship: ' your boss ', part: 'testing you' })).toEqual({
			relationship: 'your boss',
			part: 'testing you'
		});
		expect(parseCasting({ relationship: 'x'.repeat(301), part: 'testing you' })).toEqual({
			relationship: '',
			part: 'testing you'
		});
		expect(parseCasting({ relationship: 42 })).toBeNull();
		expect(parseCasting('your boss')).toBeNull();
	});
});

describe('parseName', () => {
	it('takes the name without the quotation marks a model tends to put round it', () => {
		expect(parseName({ title: '“After the meeting”' })).toBe('After the meeting');
		expect(parseName({ title: "'Late'" })).toBe('Late');
	});

	it('is null for an empty name, or one over the cap', () => {
		expect(parseName({ title: '""' })).toBeNull();
		expect(parseName({ title: 'x'.repeat(81) })).toBeNull();
		expect(parseName({ name: 'Late' })).toBeNull();
	});
});
