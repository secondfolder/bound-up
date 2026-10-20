/**
 * A passage's picture, from the description the model writes to the request
 * the image model is sent (docs/daydreams.md, "Pictures").
 *
 * The model describes the moment in plain words; everything else is decided
 * here, the same way every time: the style's words and model, an anchor that
 * everyone in it is an adult, and a negative prompt that keeps the image
 * model away from anything youthful — and, at SFW heat, from nudity. Before
 * any of that, a description that mentions a minor in any way is refused
 * outright (`imagePromptProblem`), on the server and in the browser alike,
 * so it is never sent.
 *
 * Pure and alias-free: the server builds the request with it, and the page
 * checks a description before asking.
 */

import { assertNever } from '../assert-never';
import { DAYDREAM_LIMITS, type DialValue, type PictureStyle } from '../daydream';

export const PICTURE_STYLES: readonly { value: PictureStyle; label: string }[] = [
	{ value: 'photo', label: 'Photo' },
	{ value: 'illustrated', label: 'Illustrated' }
];

/**
 * The most an encrypted picture may be. One is a portrait WEBP of around
 * 100–300 KB (`PICTURE_SIZE`), and age adds little; this leaves room for a
 * larger format without letting the endpoint store anything much bigger.
 */
export const MAX_PICTURE_BYTES = 4 * 1024 * 1024;

/** A picture's size: portrait, at SDXL's native resolution for that shape. */
export const PICTURE_SIZE = { width: 832, height: 1216 } as const;

/**
 * Words that put a minor in a picture, or a body that reads as one. Refused,
 * never rewritten: a description that reaches for any of these is not one
 * to send on with a word swapped.
 */
const MINOR_TERMS = [
	'child',
	'children',
	'childlike',
	'childish',
	'kid',
	'kids',
	'minor',
	'minors',
	'underage',
	'under-age',
	'under 18',
	'teen',
	'teens',
	'teenage',
	'teenager',
	'teenagers',
	'preteen',
	'pre-teen',
	'tween',
	'adolescent',
	'pubescent',
	'prepubescent',
	'juvenile',
	'loli',
	'lolita',
	'shota',
	'shotacon',
	'toddler',
	'infant',
	'baby',
	'babies',
	'schoolgirl',
	'schoolboy',
	'school uniform',
	'school girl',
	'school boy',
	'high school',
	'middle school',
	'young-looking',
	'young looking',
	'youthful body',
	'flat chest',
	'flat-chested',
	'little girl',
	'little boy',
	'daughter',
	'son',
	'student',
	'pigtails'
] as const;

const MINOR_PATTERN = new RegExp(
	`\\b(?:${MINOR_TERMS.map((term) => term.replace(/[-\s]/g, '[-\\s]?')).join('|')})\\b`,
	'i'
);

/** An age written as a number under 18 ("17-year-old", "aged 16", "16 years old"). */
const YOUNG_AGE =
	/\b(?:1[0-7]|[1-9])\s*(?:-|\s)?\s*(?:years?|yrs?|yo)\b|\baged?\s+(?:1[0-7]|[1-9])\b/i;

/**
 * Why a description cannot be pictured, or null when it can: too long, or
 * anything that puts a minor in it. The same check runs in the browser
 * before asking and on the server before sending.
 */
export function imagePromptProblem(prompt: string): 'empty' | 'too-long' | 'minor' | null {
	const text = prompt.trim();
	if (text === '') {
		return 'empty';
	}
	if (text.length > DAYDREAM_LIMITS.imagePrompt) {
		return 'too-long';
	}
	if (MINOR_PATTERN.test(text) || YOUNG_AGE.test(text)) {
		return 'minor';
	}
	return null;
}

/**
 * "Girl" and "boy" are how erotica often says "woman" and "man", and an
 * image model reads them literally. Said as what is meant before sending.
 */
function adultNouns(prompt: string): string {
	return prompt
		.replace(/\bgirls\b/gi, 'women')
		.replace(/\bgirl\b/gi, 'woman')
		.replace(/\bboys\b/gi, 'men')
		.replace(/\bboy\b/gi, 'man');
}

/**
 * How a model is prompted, which follows what it was trained as, not which
 * style it draws: the request that suits one family is poor for the other.
 *
 * - `sdxl` (SDXL, and Illustrious and Pony built on it): comma-separated
 *   tags, a negative prompt, real classifier-free guidance and ~30 steps.
 * - `z-image-turbo` (Z-Image Turbo and its fine-tunes): a 6B transformer read
 *   through a full language model, distilled to ~8 steps. It follows long,
 *   literal sentences closely, so the style and the safety words are said as
 *   sentences rather than tags, and "masterpiece, best quality" tags only
 *   add noise. Its own pipeline runs without guidance (CFG 1), where Runware
 *   ignores the negative prompt altogether; measured on Dark Beast 9 that
 *   way, it drew a woman described as 35 looking barely out of her teens. A
 *   little guidance (`CFGScale` 1.5) brings the negative prompt back and
 *   her age with it, without the burnt look Z-Image gets past ~2.5.
 * - `flux-2` (FLUX.2 Klein, the distilled 4B and 9B): read through a language
 *   model too, and distilled to 4 steps. FLUX has no negative prompts in its
 *   own terms, so everything it is told is said as what is wanted, and word
 *   order weighs: the description comes first, the style after it. Runware
 *   still honours a negative prompt above CFG 1, so one is sent anyway.
 */
export type PictureArchitecture = 'sdxl' | 'z-image-turbo' | 'flux-2';

/** A Runware model, and how it is prompted. */
export type PictureModel = { runwareModelAir: string; architecture: PictureArchitecture };

/**
 * The photo style is a candid personal photograph, not a studio shoot: the
 * hand-tuned prompt whose pictures were good asked for that, and the
 * description says the light itself, which "cinematic lighting" overrode.
 */
const STYLE_TAGS: Readonly<Record<PictureStyle, string>> = {
	photo:
		'photograph, realistic, candid amateur photo, natural light, natural skin texture, shallow depth of field',
	illustrated: 'masterpiece, best quality, detailed illustration, expressive, soft shading'
};

/**
 * The style as sentences, for the models that read them: an opening that sets
 * the medium, and a close that asks for the finish. The description itself
 * says the framing (`imageInstruction` in `server/daydream/prompt.ts`), so
 * these say nothing about the shot.
 */
const STYLE_SENTENCES: Readonly<Record<PictureStyle, { open: string; close: string }>> = {
	photo: {
		open: 'A candid, realistic personal photograph by a skilled amateur on a high-quality smartphone: natural, unposed and lightly processed.',
		close:
			'Realistic skin texture, natural adult proportions, sharp focus on the faces, soft shallow depth of field.'
	},
	illustrated: {
		open: 'A detailed digital illustration in a semi-realistic style.',
		close: 'Clean line art, soft shading, rich colour, adult proportions and adult faces.'
	}
};

/**
 * Everyone in it is an adult, said to the image model in its own terms: a
 * floor, not an age. Told to be "mature", or 25 and over, the models drew
 * people noticeably older than the story's; an Illustrious model, which draws
 * faces young unless told otherwise, is also told adult proportions.
 */
const ADULT_ANCHOR: Readonly<Record<PictureStyle, string>> = {
	photo: 'adults only, everyone 20 or older',
	illustrated: 'adults only, adult proportions, everyone 20 or older'
};

/** The same floor as a sentence, for a model that reads sentences. */
const ADULT_SENTENCE =
	'Everyone in the picture is a grown adult, at least 20 years old, with an adult face and body.';

/**
 * Nothing sexual at SFW heat, as a sentence. The negative prompt says it too,
 * but a sentence is what Z-Image weighs most, and the only thing FLUX reads.
 * Said as what is there rather than what is not: naming what to leave out
 * puts the word in front of a model that has no way to read it as absent.
 */
const SFW_SENTENCE = 'Everyone is fully clothed, in an everyday, non-sexual moment.';

const NEGATIVE_ALWAYS = [
	'child',
	'minor',
	'teenager',
	'young-looking',
	'childlike body',
	'baby face',
	'loli',
	'shota',
	'deformed',
	'extra limbs',
	'bad hands',
	'bad anatomy',
	// Not "text": the description quotes any writing the moment has, a sign or
	// a collar tag, and asking for none would fight it.
	'watermark',
	'signature',
	'logo'
];

/**
 * The illustrated style's own guard against drawing young, in its tags. Not
 * the photo style's: it would rule out adult bodies that are simply small.
 */
const NEGATIVE_ILLUSTRATED = ['petite', 'small breasts', 'flat chest', 'child face'];

/** At SFW heat the picture is not sexual, whatever the description says. */
const NEGATIVE_SFW = ['nude', 'naked', 'nipples', 'genitals', 'sex', 'nsfw', 'explicit'];

/**
 * What the image model was asked for one picture, exactly: the model, and the
 * prompts as `runwareTask` built them round the story model's description.
 * The picture endpoint says it in `PICTURE_REQUEST_HEADER`, and debug mode
 * keeps it on the picture's mark for the raw log (docs/debug-mode.md).
 */
export type PictureRequest = { model: string; positivePrompt: string; negativePrompt: string };

export const PICTURE_REQUEST_HEADER = 'x-picture-request';

/** The most each of a `PictureRequest`'s prompts can be: the description, and the server's words round it. */
export const MAX_PICTURE_REQUEST_PROMPT = DAYDREAM_LIMITS.imagePrompt + 400;

/**
 * What decides how long a picture takes to make: the model, its steps and
 * guidance, and the size. Not the words, nor whether it is SFW, which change
 * what is drawn but not how much drawing there is. The key the server
 * averages making times under (`picture-timings.ts`), so a change to any of
 * these starts a fresh average rather than skewing an old one.
 */
export type PictureWorkload = {
	model: string;
	steps: number;
	CFGScale: number;
	width: number;
	height: number;
};

/** The workload of one style's pictures with one model. */
export function pictureWorkload(style: PictureStyle, model: PictureModel): PictureWorkload {
	return {
		model: model.runwareModelAir,
		...scheduleFor(style, model.architecture),
		...PICTURE_SIZE
	};
}

function scheduleFor(
	style: PictureStyle,
	architecture: PictureArchitecture
): Pick<PictureWorkload, 'steps' | 'CFGScale'> {
	switch (architecture) {
		case 'z-image-turbo':
			// Its distilled schedule: more steps cost time and buy nothing.
			return { steps: 9, CFGScale: 1.5 };
		case 'flux-2':
			// Klein is distilled to 4 steps, Runware's default for it. Some
			// guidance, because Runware drops the negative prompt at CFG 1; and
			// measured on Klein 9B (2026-10-20, one seed), CFG 1 garbled a quoted
			// sign ("Open 24 Hour Hours") and left out where people were, while
			// 1.5 and 3.5 drew the same picture to the pixel, both right.
			return { steps: 4, CFGScale: 1.5 };
		case 'sdxl':
			return { steps: 30, CFGScale: style === 'photo' ? 4.5 : 6 };
		default:
			return assertNever(architecture, 'picture architecture');
	}
}

/** The words round the description, for one family. */
function positivePromptFor(
	architecture: PictureArchitecture,
	style: PictureStyle,
	sfw: boolean,
	description: string
): string {
	const sfwSentences = sfw ? [SFW_SENTENCE] : [];
	switch (architecture) {
		case 'z-image-turbo': {
			const { open, close } = STYLE_SENTENCES[style];
			// Not "No text, no watermark" any more: the negative prompt says the
			// latter at this CFG, and the description may quote text it wants.
			return [open, description, ADULT_SENTENCE, ...sfwSentences, close].join(' ');
		}
		case 'flux-2': {
			// FLUX weighs words by where they come: the subject and what it is
			// doing first, which the description opens with, then the style.
			const { open, close } = STYLE_SENTENCES[style];
			return [description, open, ADULT_SENTENCE, ...sfwSentences, close].join(' ');
		}
		case 'sdxl':
			return `${STYLE_TAGS[style]}, ${ADULT_ANCHOR[style]}. ${description}`;
		default:
			return assertNever(architecture, 'picture architecture');
	}
}

/** One Runware `imageInference` task for a description already passed by `imagePromptProblem`. */
export function runwareTask(
	input: { prompt: string; style: PictureStyle; heat: DialValue | null },
	model: PictureModel,
	taskUUID: string
) {
	const sfw = input.heat === 1;
	const { steps, CFGScale, width, height } = pictureWorkload(input.style, model);
	return {
		taskType: 'imageInference',
		taskUUID,
		model: model.runwareModelAir,
		positivePrompt: positivePromptFor(
			model.architecture,
			input.style,
			sfw,
			adultNouns(input.prompt.trim())
		),
		negativePrompt: [
			...NEGATIVE_ALWAYS,
			...(input.style === 'illustrated' ? NEGATIVE_ILLUSTRATED : []),
			...(sfw ? NEGATIVE_SFW : [])
		].join(', '),
		width,
		height,
		steps,
		CFGScale,
		numberResults: 1,
		outputType: 'base64Data',
		outputFormat: 'WEBP',
		outputQuality: 90,
		includeCost: true
	} as const;
}
