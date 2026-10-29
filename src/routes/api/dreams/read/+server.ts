import { error } from '@sveltejs/kit';
import { readRequestSchema } from '$lib/dream/requests';
import { readingMessages } from '$lib/server/dream/prompts/reading';
import { dreamsGuard, streamStory } from '$lib/server/dream-api';
import type { RequestHandler } from './$types';

/**
 * Step 1, reading the brief (docs/dreams.md, "Reading the brief"), streamed
 * so the setup page can show each part as it closes. Research is phase 6:
 * for now the model is told it cannot open links.
 */
export const POST: RequestHandler = async (event) => {
	const userId = await dreamsGuard(event.locals);
	// Parsed before the limit is counted, so a stale page does not use it up.
	const parsed = readRequestSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}
	const input = parsed.data;
	return await streamStory(event, userId, {
		messages: readingMessages({ ...input, canFetch: false }),
		// Hot enough for the unlikely directions the pick leans towards.
		temperature: 1,
		maxTokens: 4000
	});
};
