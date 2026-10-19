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

const STYLE_WORDS: Readonly<Record<PictureStyle, string>> = {
	photo: 'photograph, realistic, natural skin texture, cinematic lighting, shallow depth of field',
	illustrated: 'masterpiece, best quality, detailed illustration, expressive, soft shading'
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

const NEGATIVE_ALWAYS = [
	'child',
	'minor',
	'young-looking',
	'childlike body',
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
const NEGATIVE_ILLUSTRATED = ['petite', 'small breasts', 'flat chest', 'child face', 'baby face'];

/** At SFW heat the picture is not sexual, whatever the description says. */
const NEGATIVE_SFW = ['nude', 'naked', 'nipples', 'genitals', 'sex', 'nsfw', 'explicit'];

export type PictureModels = Readonly<Record<PictureStyle, string>>;

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

/** One Runware `imageInference` task for a description already passed by `imagePromptProblem`. */
export function runwareTask(
	input: { prompt: string; style: PictureStyle; heat: DialValue | null },
	models: PictureModels,
	taskUUID: string
) {
	const sfw = input.heat === 1;
	return {
		taskType: 'imageInference',
		taskUUID,
		model: models[input.style],
		positivePrompt: `${STYLE_WORDS[input.style]}, ${ADULT_ANCHOR[input.style]}. ${adultNouns(input.prompt.trim())}`,
		negativePrompt: [
			...NEGATIVE_ALWAYS,
			...(input.style === 'illustrated' ? NEGATIVE_ILLUSTRATED : []),
			...(sfw ? NEGATIVE_SFW : [])
		].join(', '),
		width: PICTURE_SIZE.width,
		height: PICTURE_SIZE.height,
		steps: 30,
		CFGScale: input.style === 'photo' ? 4.5 : 6,
		numberResults: 1,
		outputType: 'base64Data',
		outputFormat: 'WEBP',
		outputQuality: 90,
		includeCost: true
	} as const;
}
