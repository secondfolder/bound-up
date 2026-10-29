import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { cryptoRandom } from '$lib/dream/random';
import { drawNames } from '$lib/server/dream/names/draw';
import { dreamsGuard } from '$lib/server/dream-api';
import type { RequestHandler } from './$types';

/**
 * "Another name" on a card (docs/dreams.md, "Names"): real names drawn for a
 * character's description, leaving out the names given. No model is asked,
 * so nothing is counted against the user's limits.
 */
const namesRequestSchema = z.object({
	description: z.string().trim().min(1).max(400),
	exclude: z.array(z.string().trim().max(80)).max(200)
});

export const POST: RequestHandler = async ({ locals, request }) => {
	await dreamsGuard(locals);
	const parsed = namesRequestSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}
	return json(drawNames(parsed.data, cryptoRandom));
};
