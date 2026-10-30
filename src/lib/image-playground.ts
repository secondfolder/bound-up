/**
 * The picture playground (docs/debug-mode.md, "Picture playground"): one
 * prompt drawn by one or more Runware models, with every setting open to
 * change, to compare models and tune the recipe the daydreams use.
 *
 * Pure and alias-free, like `daydream/image-prompt.ts` it builds on: the
 * endpoint builds each model's task with it, and the page fills its form
 * from the same defaults.
 *
 * What it never lets go of is the daydreams' line on minors: a prompt that
 * mentions one is refused before anything is sent (`mentionsMinor`), and
 * every task's negative prompt starts with `NEGATIVE_MINORS`, in either
 * recipe, whatever the negative prompt typed says.
 */

import { z } from 'zod';
import { DAYDREAM_LIMITS, type PictureStyle } from './daydream';
import {
	adultNouns,
	mentionsMinor,
	NEGATIVE_MINORS,
	PICTURE_SIZE,
	type PictureArchitecture,
	pictureWorkload,
	runwareTask
} from './daydream/image-prompt';

/**
 * Longer than a daydream's description (`DAYDREAM_LIMITS.imagePrompt`): a
 * raw prompt carries the style and safety words a daydream's has added round it.
 */
export const MAX_PLAYGROUND_PROMPT = DAYDREAM_LIMITS.imagePrompt * 3;
export const MAX_PLAYGROUND_NEGATIVE = 2000;
/** More pictures than this per model per run gets slow and dear, for a comparison. */
export const MAX_PLAYGROUND_RESULTS = 4;
/** How many models one run compares at most. */
export const MAX_PLAYGROUND_MODELS = 8;

/** Runware's bounds on a picture's sides: multiples of 64, 128 to 2048. */
export const MIN_SIDE = 128;
export const MAX_SIDE = 2048;
export const SIDE_STEP = 64;

/** Sizes offered by name: the daydreams' own first, then each base model's usual shapes. */
export const PLAYGROUND_SIZES = [
	{ label: `Daydreams’ (${PICTURE_SIZE.width}×${PICTURE_SIZE.height})`, ...PICTURE_SIZE },
	{ label: 'Square (1024×1024)', width: 1024, height: 1024 },
	{ label: 'Portrait 3:4 (896×1152)', width: 896, height: 1152 },
	{ label: 'Portrait 9:16 (768×1344)', width: 768, height: 1344 },
	{ label: 'Landscape 4:3 (1152×896)', width: 1152, height: 896 },
	{ label: 'Landscape 16:9 (1344×768)', width: 1344, height: 768 }
] as const;

/**
 * Schedulers Runware takes by name; none named is the model's own default,
 * which is what the daydreams send. Not every model takes every one: a
 * refusal comes back from Runware as the run's error.
 */
export const PLAYGROUND_SCHEDULERS = [
	'Euler',
	'Euler a',
	'Euler Beta',
	'DPM++ 2M',
	'DPM++ 2M Karras',
	'DPM++ 2M SDE Karras',
	'DPM++ SDE Karras',
	'DDIM',
	'UniPC',
	'LCM',
	'FlowMatchEulerDiscreteScheduler'
] as const;

export const PLAYGROUND_FORMATS = ['WEBP', 'PNG', 'JPG'] as const;
export type PlaygroundFormat = (typeof PLAYGROUND_FORMATS)[number];

/** A picture format's file extension and media type. */
export const FORMAT_FILES: Readonly<
	Record<PlaygroundFormat, { extension: string; contentType: string }>
> = {
	WEBP: { extension: 'webp', contentType: 'image/webp' },
	PNG: { extension: 'png', contentType: 'image/png' },
	JPG: { extension: 'jpg', contentType: 'image/jpeg' }
};

/**
 * - `app`: the prompt is a daydream's description, and the words, negative
 *   prompt and schedule round it are the daydreams' own for the model's base
 *   (`runwareTask`); anything set here then overrides that.
 * - `raw`: the prompt and negative prompt are sent as typed, the minors
 *   terms aside.
 */
export const PLAYGROUND_RECIPES = ['app', 'raw'] as const;

const side = z
	.number()
	.int()
	.min(MIN_SIDE)
	.max(MAX_SIDE)
	.refine((value) => value % SIDE_STEP === 0, `A multiple of ${SIDE_STEP}`);

const ARCHITECTURES = [
	'sdxl',
	'z-image-turbo',
	'flux-2'
] as const satisfies readonly PictureArchitecture[];

/** Everything one model's run is drawn with. Null is "as the recipe says". */
export const playgroundRunSchema = z.object({
	/** The comparison this run belongs to: one per press of Draw, shared by its models. */
	runId: z.uuid(),
	recipe: z.enum(PLAYGROUND_RECIPES),
	prompt: z.string().trim().min(1).max(MAX_PLAYGROUND_PROMPT),
	negativePrompt: z.string().trim().max(MAX_PLAYGROUND_NEGATIVE),
	style: z.enum(['photo', 'illustrated']),
	heat: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable(),
	model: z.object({
		runwareModelAir: z.string().regex(/^[a-z0-9_-]+:[a-z0-9_-]+@[a-z0-9_.-]+$/i),
		/** What it is called on the page, for the history. */
		label: z.string().trim().min(1).max(120),
		architecture: z.enum(ARCHITECTURES)
	}),
	width: side.nullable(),
	height: side.nullable(),
	steps: z.number().int().min(1).max(100).nullable(),
	CFGScale: z.number().min(0).max(30).nullable(),
	scheduler: z.enum(PLAYGROUND_SCHEDULERS).nullable(),
	/** Null is a random one, which Runware picks and says. */
	seed: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).nullable(),
	clipSkip: z.number().int().min(0).max(2).nullable(),
	numberResults: z.number().int().min(1).max(MAX_PLAYGROUND_RESULTS),
	outputFormat: z.enum(PLAYGROUND_FORMATS)
});

export type PlaygroundRun = z.output<typeof playgroundRunSchema>;

/** Why a run cannot be drawn, before anything is sent, or null when it can. */
export function playgroundProblem(
	run: Pick<PlaygroundRun, 'prompt' | 'negativePrompt'>
): string | null {
	// The negative prompt too: a raw one could ask for a minor by negating
	// adult words ("adult" in the negative), and naming one there at all is
	// no part of tuning a model for adults.
	if (mentionsMinor(run.prompt) || mentionsMinor(run.negativePrompt)) {
		return 'That can’t be pictured: it mentions someone under 18.';
	}
	return null;
}

/** One `imageInference` task for a run that `playgroundProblem` passed. */
export function playgroundTask(run: PlaygroundRun, taskUUID: string) {
	const model = {
		runwareModelAir: run.model.runwareModelAir,
		architecture: run.model.architecture
	};
	const base =
		run.recipe === 'app'
			? runwareTask({ prompt: run.prompt, style: run.style, heat: run.heat }, model, taskUUID)
			: null;
	const schedule = pictureWorkload(run.style, model);
	const typedNegative = run.negativePrompt.trim();
	const negativePrompt = base
		? [base.negativePrompt, typedNegative].filter(Boolean).join(', ')
		: [...NEGATIVE_MINORS, ...(typedNegative ? [typedNegative] : [])].join(', ');
	return {
		taskType: 'imageInference',
		taskUUID,
		model: model.runwareModelAir,
		// Raw still says "woman" for "girl": the daydreams' reading of it, and
		// the one an image model would otherwise take literally.
		positivePrompt: base?.positivePrompt ?? adultNouns(run.prompt.trim()),
		negativePrompt,
		width: run.width ?? schedule.width,
		height: run.height ?? schedule.height,
		// Null on both sides is Runware's default, so it is not sent.
		...optional('steps', run.steps ?? schedule.steps),
		...optional('CFGScale', run.CFGScale ?? schedule.CFGScale),
		...(run.scheduler === null ? {} : { scheduler: run.scheduler }),
		...(run.seed === null ? {} : { seed: run.seed }),
		...(run.clipSkip === null ? {} : { clipSkip: run.clipSkip }),
		numberResults: run.numberResults,
		outputType: 'base64Data',
		outputFormat: run.outputFormat,
		outputQuality: 90,
		includeCost: true
	} as const;
}

function optional<K extends string>(key: K, value: number | null): { [P in K]?: number } {
	return (value === null ? {} : { [key]: value }) as { [P in K]?: number };
}

export type PlaygroundTask = ReturnType<typeof playgroundTask>;

/** The schedule a model would be drawn with, for the form's placeholders. Null is Runware's default. */
export function playgroundDefaults(
	style: PictureStyle,
	architecture: PictureArchitecture
): { steps: number | null; CFGScale: number | null; width: number; height: number } {
	const { steps, CFGScale, width, height } = pictureWorkload(style, {
		runwareModelAir: '',
		architecture
	});
	return { steps, CFGScale, width, height };
}

/** One picture of a run, as the history keeps it. */
export type PlaygroundImage = {
	/** Where the page loads it from: the history's file, or the picture itself when nothing is kept. */
	src: string;
	seed: number | null;
	cost: number | null;
	/** Whether Runware's own check thought it explicit, when it said. */
	nsfw: boolean | null;
};

/** One model's run: what was asked, exactly what was sent, and what came back. */
export type PlaygroundEntry = {
	id: string;
	runId: string;
	/** When it was drawn, as an ISO time. */
	at: string;
	run: PlaygroundRun;
	task: PlaygroundTask;
	images: PlaygroundImage[];
	/** How long Runware took. */
	ms: number;
};

/** A history entry's id and picture file names: made here, checked when served. */
export const PLAYGROUND_FILE = /^[0-9a-f-]{36}(?:-\d+\.(?:webp|png|jpg)|\.json)$/;
