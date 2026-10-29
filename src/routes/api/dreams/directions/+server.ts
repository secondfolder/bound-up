import { error } from '@sveltejs/kit';
import { passageRequestSchema } from '$lib/dream/requests';
import { passageMessages } from '$lib/server/dream/prompts/passage';
import { SAMPLING } from '$lib/server/dream/sampling';
import { askOnce, dreamsGuard } from '$lib/server/dream-api';
import type { RequestHandler } from './$types';

/**
 * Where the story could go next, as a list with likelihoods, for "Different
 * direction" and for escaping a loop (docs/dreams.md): the page picks one,
 * leaning towards the unlikely, and asks for the passage with it. Answered
 * whole, like the small calls, and counted as one.
 */
export const POST: RequestHandler = async (event) => {
	const userId = await dreamsGuard(event.locals);
	const parsed = passageRequestSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}
	return await askOnce(event, userId, {
		messages: passageMessages({ ...parsed.data, mode: 'directions' }),
		...SAMPLING.directions
	});
};
