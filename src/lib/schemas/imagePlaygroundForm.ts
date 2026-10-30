import { z } from 'zod';
import {
	MAX_PLAYGROUND_NEGATIVE,
	MAX_PLAYGROUND_PROMPT,
	PLAYGROUND_FORMATS,
	PLAYGROUND_RECIPES,
	PLAYGROUND_SCHEDULERS
} from '$lib/image-playground';

/**
 * The picture playground's settings (docs/debug-mode.md, "Picture
 * playground"). Sent from the browser, one request per model, so the
 * superform is built from `defaults()` (AGENTS.md, "Forms"). The numbers are
 * typed text, empty for "as the recipe says", and read with `readNumberText`
 * when sent; `playgroundRunSchema` is what checks them.
 */
const numberText = z
	.string()
	.trim()
	.refine((text) => text === '' || Number.isFinite(Number(text)), 'A number, or empty');

export const imagePlaygroundFormSchema = z.object({
	recipe: z.enum(PLAYGROUND_RECIPES),
	prompt: z.string().trim().min(1, 'Describe a picture first').max(MAX_PLAYGROUND_PROMPT),
	negativePrompt: z.string().trim().max(MAX_PLAYGROUND_NEGATIVE),
	style: z.enum(['photo', 'illustrated']),
	/** `none` and `default` rather than an empty option, which `wa-select` will not show as chosen. */
	heat: z.enum(['none', '1', '2', '3', '4', '5']),
	width: numberText,
	height: numberText,
	steps: numberText,
	CFGScale: numberText,
	scheduler: z.enum(['default', ...PLAYGROUND_SCHEDULERS]),
	seed: numberText,
	/** One seed for every model, so the comparison is of the models and not the luck. */
	sameSeed: z.boolean(),
	clipSkip: z.enum(['default', '0', '1', '2']),
	numberResults: z.enum(['1', '2', '3', '4']),
	outputFormat: z.enum(PLAYGROUND_FORMATS)
});

export type ImagePlaygroundForm = z.output<typeof imagePlaygroundFormSchema>;
