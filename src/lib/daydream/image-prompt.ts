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
 */
export type PictureArchitecture = 'sdxl' | 'z-image-turbo';

/** A Runware model, and how it is prompted. */
export type PictureModel = { air: string; architecture: PictureArchitecture };

/** Each style's model AIR, as configured. */
export type PictureModels = Readonly<Record<PictureStyle, string>>;

/**
 * Ours, for the `architecture` Runware's `modelSearch` reports for a model,
 * or null for a family no recipe here suits.
 */
export function pictureArchitecture(runware: string): PictureArchitecture | null {
	if (runware.startsWith('z_image')) {
		return 'z-image-turbo';
	}
	if (['sdxl', 'illustrious', 'pony', 'noobai'].includes(runware)) {
		return 'sdxl';
	}
	return null;
}

const STYLE_TAGS: Readonly<Record<PictureStyle, string>> = {
	photo: 'photograph, realistic, natural skin texture, cinematic lighting, shallow depth of field',
	illustrated: 'masterpiece, best quality, detailed illustration, expressive, soft shading'
};

/**
 * The style in Z-Image's terms: an opening that sets the medium, and a close
 * that asks for the finish. The description itself starts with the framing
 * (`IMAGE_INSTRUCTION` in `server/daydream/prompt.ts`), so these say nothing
 * about the shot.
 */
const STYLE_SENTENCES: Readonly<Record<PictureStyle, { open: string; close: string }>> = {
	photo: {
		open: 'A candid, realistic photograph.',
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
 * but a sentence is what Z-Image weighs most.
 */
const SFW_SENTENCE = 'Everyone is fully clothed, and nothing in it is sexual.';

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
	'text',
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

/** The words round the description, the steps and the guidance, for one family. */
function recipe(
	architecture: PictureArchitecture,
	style: PictureStyle,
	sfw: boolean,
	description: string
): { positivePrompt: string; steps: number; CFGScale: number } {
	if (architecture === 'z-image-turbo') {
		const { open, close } = STYLE_SENTENCES[style];
		return {
			positivePrompt: [
				open,
				description,
				ADULT_SENTENCE,
				...(sfw ? [SFW_SENTENCE] : []),
				close,
				'No text, no watermark.'
			].join(' '),
			// Its distilled schedule: more steps cost time and buy nothing.
			steps: 9,
			CFGScale: 1.5
		};
	}
	return {
		positivePrompt: `${STYLE_TAGS[style]}, ${ADULT_ANCHOR[style]}. ${description}`,
		steps: 30,
		CFGScale: style === 'photo' ? 4.5 : 6
	};
}

/** One Runware `imageInference` task for a description already passed by `imagePromptProblem`. */
export function runwareTask(
	input: { prompt: string; style: PictureStyle; heat: DialValue | null },
	model: PictureModel,
	taskUUID: string
) {
	const sfw = input.heat === 1;
	const { positivePrompt, steps, CFGScale } = recipe(
		model.architecture,
		input.style,
		sfw,
		adultNouns(input.prompt.trim())
	);
	return {
		taskType: 'imageInference',
		taskUUID,
		model: model.air,
		positivePrompt,
		negativePrompt: [
			...NEGATIVE_ALWAYS,
			...(input.style === 'illustrated' ? NEGATIVE_ILLUSTRATED : []),
			...(sfw ? NEGATIVE_SFW : [])
		].join(', '),
		width: PICTURE_SIZE.width,
		height: PICTURE_SIZE.height,
		steps,
		CFGScale,
		numberResults: 1,
		outputType: 'base64Data',
		outputFormat: 'WEBP',
		outputQuality: 90,
		includeCost: true
	} as const;
}
