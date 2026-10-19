import { describe, expect, it } from 'vitest';
import { DAYDREAM_LIMITS } from '../daydream';
import { imagePromptProblem, PICTURE_SIZE, runwareTask } from './image-prompt';

const models = { photo: 'civitai:1@1', illustrated: 'civitai:2@2' };

describe('imagePromptProblem', () => {
	it('lets an adult scene through', () => {
		expect(
			imagePromptProblem(
				'A woman in her thirties, kneeling and bound with red rope, in a candlelit bedroom'
			)
		).toBeNull();
	});

	it('refuses anything that puts a minor in the picture', () => {
		for (const prompt of [
			'a teen on a bed',
			'a TEENAGE woman',
			'two kids nearby',
			'a schoolgirl outfit',
			'wearing a school uniform',
			'a young-looking woman',
			'a young looking woman',
			'loli style',
			'a 17-year-old',
			'she is 16 years old',
			'aged 15',
			'a childlike body',
			'flat-chested and tiny',
			'a little girl'
		]) {
			expect(imagePromptProblem(prompt), prompt).toBe('minor');
		}
	});

	it('does not refuse words that only contain one', () => {
		for (const prompt of ['a person in a kidskin glove', 'Sonia smiles', 'a 25-year-old man']) {
			expect(imagePromptProblem(prompt), prompt).toBeNull();
		}
	});

	it('refuses an empty description and one past the limit', () => {
		expect(imagePromptProblem('  ')).toBe('empty');
		expect(imagePromptProblem('x'.repeat(DAYDREAM_LIMITS.imagePrompt + 1))).toBe('too-long');
	});
});

describe('runwareTask', () => {
	it('asks the style’s model for one portrait picture, back as data', () => {
		const task = runwareTask({ prompt: 'A man in a suit', style: 'photo', heat: 4 }, models, 't1');
		expect(task).toMatchObject({
			taskType: 'imageInference',
			taskUUID: 't1',
			model: 'civitai:1@1',
			width: PICTURE_SIZE.width,
			height: PICTURE_SIZE.height,
			numberResults: 1,
			outputType: 'base64Data',
			outputFormat: 'WEBP'
		});
		expect(task.positivePrompt).toMatch(/^photograph/);
		expect(task.positivePrompt).toContain('adults only');
		expect(task.positivePrompt).toMatch(/A man in a suit$/);
		expect(runwareTask({ prompt: 'x', style: 'illustrated', heat: 4 }, models, 't2').model).toBe(
			'civitai:2@2'
		);
	});

	it('keeps the image model away from anything youthful, and from nudity at SFW', () => {
		const explicit = runwareTask({ prompt: 'x', style: 'photo', heat: 5 }, models, 't');
		expect(explicit.negativePrompt).toContain('child');
		expect(explicit.negativePrompt).not.toContain('nude');
		const sfw = runwareTask({ prompt: 'x', style: 'photo', heat: 1 }, models, 't');
		expect(sfw.negativePrompt).toContain('nude');
		// The illustrated style's own guard, in its tags, and not the photo style's.
		expect(explicit.negativePrompt).not.toContain('baby face');
		const drawn = runwareTask({ prompt: 'x', style: 'illustrated', heat: 5 }, models, 't');
		expect(drawn.negativePrompt).toContain('baby face');
		expect(drawn.positivePrompt).toContain('adults only');
	});

	it('says woman and man where the description says girl and boy', () => {
		const task = runwareTask(
			{ prompt: 'Two girls kiss a boy', style: 'photo', heat: 4 },
			models,
			't'
		);
		expect(task.positivePrompt).toContain('Two women kiss a man');
	});
});
