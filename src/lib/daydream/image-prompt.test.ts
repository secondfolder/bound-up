import { describe, expect, it } from 'vitest';
import { DAYDREAM_LIMITS } from '../daydream';
import {
	imagePromptProblem,
	MAX_PICTURE_REQUEST_PROMPT,
	PICTURE_SIZE,
	type PictureModel,
	runwareTask
} from './image-prompt';

const sdxl: PictureModel = { runwareModelAir: 'civitai:1@1', architecture: 'sdxl' };
const zImage: PictureModel = { runwareModelAir: 'persona:2@2', architecture: 'z-image-turbo' };

describe('imagePromptProblem', () => {
	it('lets an adult idea through', () => {
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
	it('asks the model for one portrait picture, back as data', () => {
		const task = runwareTask({ prompt: 'A man in a suit', style: 'photo', heat: 4 }, sdxl, 't1');
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
		expect(runwareTask({ prompt: 'x', style: 'illustrated', heat: 4 }, zImage, 't2').model).toBe(
			'persona:2@2'
		);
	});

	it('prompts an SDXL model in tags, with real guidance', () => {
		const task = runwareTask({ prompt: 'A man in a suit', style: 'photo', heat: 4 }, sdxl, 't');
		expect(task.positivePrompt).toMatch(/^photograph/);
		expect(task.positivePrompt).toContain('adults only');
		expect(task.positivePrompt).toMatch(/A man in a suit$/);
		expect(task).toMatchObject({ steps: 30, CFGScale: 4.5 });
	});

	it('prompts a Z-Image Turbo model in sentences, on its short schedule', () => {
		const task = runwareTask({ prompt: 'A man in a suit.', style: 'photo', heat: 4 }, zImage, 't');
		expect(task.positivePrompt).toMatch(/^A candid, realistic photograph\. A man in a suit\. /);
		expect(task.positivePrompt).toContain('at least 20 years old');
		expect(task.positivePrompt).not.toContain('masterpiece');
		expect(task.steps).toBeLessThanOrEqual(12);
		// Above 1, or Runware drops the negative prompt and its guard with it.
		expect(task.CFGScale).toBeGreaterThan(1);
		expect(task.CFGScale).toBeLessThan(2.5);
		const drawn = runwareTask({ prompt: 'x', style: 'illustrated', heat: 4 }, zImage, 't');
		expect(drawn.positivePrompt).toMatch(/^A detailed digital illustration/);
	});

	it('keeps the image model away from anything youthful, and from nudity at SFW', () => {
		for (const model of [sdxl, zImage]) {
			const explicit = runwareTask({ prompt: 'x', style: 'photo', heat: 5 }, model, 't');
			expect(explicit.negativePrompt).toContain('child');
			expect(explicit.negativePrompt).toContain('baby face');
			expect(explicit.negativePrompt).not.toContain('nude');
			const sfw = runwareTask({ prompt: 'x', style: 'photo', heat: 1 }, model, 't');
			expect(sfw.negativePrompt).toContain('nude');
			// The illustrated style's own guard, in its tags, and not the photo style's.
			expect(explicit.negativePrompt).not.toContain('flat chest');
			const drawn = runwareTask({ prompt: 'x', style: 'illustrated', heat: 5 }, model, 't');
			expect(drawn.negativePrompt).toContain('flat chest');
		}
		// A sentence for Z-Image too, which weighs one over a negative prompt.
		const sfw = runwareTask({ prompt: 'x', style: 'photo', heat: 1 }, zImage, 't');
		expect(sfw.positivePrompt).toContain('fully clothed');
		const explicit = runwareTask({ prompt: 'x', style: 'photo', heat: 5 }, zImage, 't');
		expect(explicit.positivePrompt).not.toContain('fully clothed');
	});

	it('says woman and man where the description says girl and boy', () => {
		for (const model of [sdxl, zImage]) {
			const task = runwareTask(
				{ prompt: 'Two girls kiss a boy', style: 'photo', heat: 4 },
				model,
				't'
			);
			expect(task.positivePrompt).toContain('Two women kiss a man');
		}
	});

	it('fits the longest description in what debug mode keeps of a request', () => {
		const prompt = 'x'.repeat(DAYDREAM_LIMITS.imagePrompt);
		for (const model of [sdxl, zImage]) {
			for (const style of ['photo', 'illustrated'] as const) {
				const task = runwareTask({ prompt, style, heat: 1 }, model, 't');
				expect(task.positivePrompt.length).toBeLessThanOrEqual(MAX_PICTURE_REQUEST_PROMPT);
				expect(task.negativePrompt.length).toBeLessThanOrEqual(MAX_PICTURE_REQUEST_PROMPT);
			}
		}
	});
});
