import { describe, expect, it } from 'vitest';
import { NEGATIVE_MINORS, runwareTask } from './daydream/image-prompt';
import {
	type PlaygroundRun,
	playgroundProblem,
	playgroundRunSchema,
	playgroundTask
} from './image-playground';

const RUN: PlaygroundRun = {
	runId: '00000000-0000-4000-8000-000000000000',
	recipe: 'app',
	prompt: 'A woman reading by a window at dusk.',
	negativePrompt: '',
	style: 'photo',
	heat: 3,
	model: {
		runwareModelAir: 'persona:242173@2788849',
		label: 'Dark Beast',
		architecture: 'z-image-turbo'
	},
	width: null,
	height: null,
	steps: null,
	CFGScale: null,
	scheduler: null,
	seed: null,
	clipSkip: null,
	numberResults: 1,
	outputFormat: 'WEBP'
};

const ID = '11111111-1111-4111-8111-111111111111';

describe('playgroundTask', () => {
	it('is the daydreams’ own task for the app recipe with nothing set', () => {
		const daydream = runwareTask({ prompt: RUN.prompt, style: 'photo', heat: 3 }, RUN.model, ID);
		const task = playgroundTask(RUN, ID);
		expect(task.positivePrompt).toBe(daydream.positivePrompt);
		expect(task.negativePrompt).toBe(daydream.negativePrompt);
		expect([task.width, task.height, task.steps, task.CFGScale]).toEqual([
			daydream.width,
			daydream.height,
			daydream.steps,
			daydream.CFGScale
		]);
		expect(task).not.toHaveProperty('seed');
		expect(task).not.toHaveProperty('scheduler');
	});

	it('takes every setting given over the recipe’s', () => {
		const task = playgroundTask(
			{
				...RUN,
				width: 1024,
				height: 1024,
				steps: 20,
				CFGScale: 3,
				scheduler: 'Euler a',
				seed: 42,
				clipSkip: 2,
				numberResults: 3,
				outputFormat: 'PNG',
				negativePrompt: 'blurry'
			},
			ID
		);
		expect(task).toMatchObject({
			width: 1024,
			height: 1024,
			steps: 20,
			CFGScale: 3,
			scheduler: 'Euler a',
			seed: 42,
			clipSkip: 2,
			numberResults: 3,
			outputFormat: 'PNG'
		});
		expect(task.negativePrompt.endsWith(', blurry')).toBe(true);
	});

	it('sends a raw prompt as typed, but the negative prompt always starts with the minors terms', () => {
		const task = playgroundTask(
			{ ...RUN, recipe: 'raw', prompt: 'portrait, soft light', negativePrompt: 'blurry' },
			ID
		);
		expect(task.positivePrompt).toBe('portrait, soft light');
		expect(task.negativePrompt).toBe(`${NEGATIVE_MINORS.join(', ')}, blurry`);
		expect(playgroundTask({ ...RUN, recipe: 'raw', negativePrompt: '' }, ID).negativePrompt).toBe(
			NEGATIVE_MINORS.join(', ')
		);
	});

	it('still says woman for girl in a raw prompt', () => {
		expect(
			playgroundTask({ ...RUN, recipe: 'raw', prompt: 'a girl smiling' }, ID).positivePrompt
		).toBe('a woman smiling');
	});
});

describe('playgroundProblem', () => {
	it('refuses a prompt or negative prompt that mentions a minor', () => {
		expect(playgroundProblem({ prompt: 'a 16-year-old', negativePrompt: '' })).not.toBeNull();
		expect(playgroundProblem({ prompt: 'a woman', negativePrompt: 'adult' })).toBeNull();
		expect(playgroundProblem({ prompt: 'a woman', negativePrompt: 'aged 15' })).not.toBeNull();
		expect(playgroundProblem({ prompt: 'a woman', negativePrompt: '' })).toBeNull();
	});
});

describe('playgroundRunSchema', () => {
	it('takes only sides Runware can draw', () => {
		expect(playgroundRunSchema.safeParse({ ...RUN, width: 1000 }).success).toBe(false);
		expect(playgroundRunSchema.safeParse({ ...RUN, width: 64 }).success).toBe(false);
		expect(playgroundRunSchema.safeParse({ ...RUN, width: 1024 }).success).toBe(true);
	});
});
