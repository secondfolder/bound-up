import { z } from 'zod';
import { IQ_CEILING, IQ_FLOOR } from '$lib/playroom/iq-test/scoring';
import {
	INTENSITIES,
	IQ_INPUT_MAX,
	IQ_INPUT_MIN,
	ROLES,
	VIBES
} from '$lib/playroom/iq-test/settings';

/**
 * A finished IQ test as the browser posts it, and as device history keeps it.
 *
 * Not a form: the test runs in the browser and posts its result as JSON when
 * it finishes, so this is shared between that `fetch` and the endpoint rather
 * than going through superforms.
 */
const iqInput = z.number().int().min(IQ_INPUT_MIN).max(IQ_INPUT_MAX).nullable();

export const iqTestResultSchema = z
	.object({
		role: z.enum(ROLES),
		intensity: z.literal(INTENSITIES),
		vibe: z.enum(VIBES).nullable(),
		iq: z.number().int().min(IQ_FLOOR).max(IQ_CEILING),
		correct: z.number().int().min(0),
		attempted: z.number().int().min(1),
		skipped: z.number().int().min(0),
		/** Whether the results humiliated and wore the vibe's look, as in effect. */
		humiliating: z.boolean(),
		themedLook: z.boolean(),
		soberIq: iqInput,
		targetIq: iqInput,
		seed: z.number().int().min(0).max(0xff_ff_ff_ff)
	})
	.refine((result) => result.correct + result.skipped <= result.attempted, {
		message: 'More correct answers and skips than attempts',
		path: ['correct']
	});

export type IqTestResultInput = z.output<typeof iqTestResultSchema>;
