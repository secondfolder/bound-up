import { error } from '@sveltejs/kit';
import { passageRequestSchema } from '$lib/dream/requests';
import { passageMessages } from '$lib/server/dream/prompts/passage';
import { SAMPLING } from '$lib/server/dream/sampling';
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
		...(input.take ? SAMPLING.take : SAMPLING.passage)
	});
};
