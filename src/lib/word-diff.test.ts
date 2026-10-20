import { describe, expect, it } from 'vitest';
import { runwareTask } from './daydream/image-prompt';
import { addedRuns } from './word-diff';

const added = (from: string, to: string) =>
	addedRuns(from, to)
		.filter((run) => run.added)
		.map((run) => run.text);

describe('addedRuns', () => {
	it('marks the words put round a text, and leaves the text itself plain', () => {
		const runs = addedRuns(
			'A woman at a desk',
			'A candid photograph. A woman at a desk. Adults only.'
		);
		expect(runs.map((run) => run.text).join('')).toBe(
			'A candid photograph. A woman at a desk. Adults only.'
		);
		expect(
			added('A woman at a desk', 'A candid photograph. A woman at a desk. Adults only.')
		).toEqual(['A candid photograph.', '. Adults only.']);
	});

	it('marks a word changed on the way', () => {
		expect(added('a girl by the window', 'a woman by the window')).toEqual(['woman']);
	});

	it('compares punctuation apart from the word it is stuck to', () => {
		expect(added('at a desk', 'at a desk.')).toEqual(['.']);
	});

	it('marks nothing when nothing was added, and everything when nothing was shared', () => {
		expect(added('same words', 'same words')).toEqual([]);
		expect(addedRuns('', 'all new')).toEqual([{ text: 'all new', added: true }]);
		expect(addedRuns('anything', '')).toEqual([]);
	});

	it('leaves a real description plain inside the prompt the server builds round it', () => {
		const description = 'A woman in her thirties at a desk, lamp light, rain on the window';
		for (const architecture of ['z-image-turbo', 'sdxl'] as const) {
			const task = runwareTask(
				{ prompt: description, style: 'photo', heat: 3 },
				{ runwareModelAir: 'x:1@1', architecture },
				'id'
			);
			const plain = addedRuns(description, task.positivePrompt)
				.filter((run) => !run.added)
				.map((run) => run.text)
				.join('');
			expect(plain.trim()).toBe(description);
		}
	});
});
