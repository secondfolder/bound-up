import { describe, expect, it } from 'vitest';
import { HELP_RULES, helpMessages, parseHelpAnswer, sceneHelpRequestSchema } from './model-help';

describe('helpMessages', () => {
	it('sends the rules, the task and the page, and nothing else', () => {
		const [system, user] = helpMessages({ task: 'missed', page: 'Rope, slow, blindfolded.' });
		expect(system?.content).toBe(HELP_RULES.join('\n'));
		expect(user?.content).toContain('Rope, slow, blindfolded.');
		expect(user?.content).toContain('"ideas"');
	});

	it('names the story line it wants chips for', () => {
		const [, user] = helpMessages({ task: 'story-chips', line: 'where', page: '' });
		expect(user?.content).toContain('"Where" line');
		expect(user?.content).toContain('(nothing written yet)');
	});

	/** Minors are never in scope, whatever the scene says (the project's standing rule). */
	it('rules out minors in every request', () => {
		for (const request of [
			{ task: 'missed', page: '' },
			{ task: 'menu', page: '' },
			{ task: 'story-chips', line: 'parts', page: '' }
		] as const) {
			expect(helpMessages(request)[0]?.content).toContain(
				'Never suggest anything involving a minor'
			);
		}
	});
});

describe('parseHelpAnswer', () => {
	it('reads an answer wrapped in a code fence', () => {
		expect(parseHelpAnswer('story-chips', '```json\n{"chips":["a hotel room"]}\n```')).toEqual({
			task: 'story-chips',
			chips: ['a hotel room']
		});
	});

	it('refuses an answer in another task’s shape, or none at all', () => {
		expect(parseHelpAnswer('menu', '{"chips":["x"]}')).toBeNull();
		expect(parseHelpAnswer('missed', 'I cannot help with that.')).toBeNull();
	});

	it('refuses a chip with a comma, which would split in two on the page', () => {
		expect(parseHelpAnswer('story-chips', '{"chips":["tied up, blindfolded"]}')).toBeNull();
	});

	it('files an idea under notes when the model names a part that does not exist', () => {
		expect(
			parseHelpAnswer(
				'missed',
				'{"ideas":[{"title":"Water?","why":"Stay hydrated.","section":"snacks"}]}'
			)
		).toEqual({
			task: 'missed',
			ideas: [{ title: 'Water?', why: 'Stay hydrated.', section: 'notes' }]
		});
	});
});

describe('sceneHelpRequestSchema', () => {
	it('caps the page sent', () => {
		expect(
			sceneHelpRequestSchema.safeParse({ task: 'missed', page: 'x'.repeat(9000) }).success
		).toBe(false);
	});
});
