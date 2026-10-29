import { error } from '@sveltejs/kit';
import { cryptoRandom } from '$lib/dream/random';
import { buildRequestSchema } from '$lib/dream/requests';
import { drawPool } from '$lib/server/dream/names/draw';
import { buildMessages } from '$lib/server/dream/prompts/build';
import { SAMPLING } from '$lib/server/dream/sampling';
import { dreamsGuard, streamStory } from '$lib/server/dream-api';
import type { RequestHandler } from './$types';

/**
 * Building the daydream and writing its opening, in one streamed reply
 * (docs/dreams.md, "Building the daydream"). Asked again with the previous
 * build and the changes when the user asks for a change.
 */
export const POST: RequestHandler = async (event) => {
	const userId = await dreamsGuard(event.locals);
	const parsed = buildRequestSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}
	return await streamStory(event, userId, {
		messages: buildMessages({
			...parsed.data,
			// Code's randomness: names drawn here, never the model's habits.
			namePool: drawPool(cryptoRandom, parsed.data.recentNames)
		}),
		...SAMPLING.build
	});
};
