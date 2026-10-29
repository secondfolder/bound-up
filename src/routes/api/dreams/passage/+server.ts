import { error } from '@sveltejs/kit';
import { passageRequestSchema } from '$lib/dream/requests';
import { passageMessages } from '$lib/server/dream/prompts/passage';
import { dreamsGuard, streamStory } from '$lib/server/dream-api';
import type { RequestHandler } from './$types';

/**
 * The next passage, or another take of one (docs/dreams.md, "Playing"),
 * routed to providers that allow the daydream's heat.
 */
export const POST: RequestHandler = async (event) => {
	const userId = await dreamsGuard(event.locals);
	const parsed = passageRequestSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}
	const input = parsed.data;
	return await streamStory(event, userId, {
		messages: passageMessages(input),
		// Another take a little hotter, so it goes somewhere new in its words.
		temperature: input.take ? 1 : 0.9,
		maxTokens: 6000
	});
};
