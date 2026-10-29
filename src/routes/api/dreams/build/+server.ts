import { error } from '@sveltejs/kit';
import { buildRequestSchema } from '$lib/dream/requests';
import { buildMessages } from '$lib/server/dream/prompts/build';
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
		messages: buildMessages(parsed.data),
		heat: null,
		temperature: 0.9,
		// The build and the opening, plus room for a reasoning model to think:
		// its reasoning counts against this too.
		maxTokens: 9000
	});
};
