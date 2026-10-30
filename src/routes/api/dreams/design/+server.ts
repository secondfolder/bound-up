import { error } from '@sveltejs/kit';
import { designRequestSchema } from '$lib/dream/requests';
import { designMessages } from '$lib/server/dream/prompts/design';
import { SAMPLING } from '$lib/server/dream/sampling';
import { askOnce, dreamsGuard } from '$lib/server/dream-api';
import type { RequestHandler } from './$types';

/**
 * Designs a block the story model described (docs/dreams.md, "Designed
 * blocks"): answered whole, as the layout's JSON, which the page checks
 * (`parseDesign`) before it keeps anything. Counted against the same limit
 * as the other small calls.
 */
export const POST: RequestHandler = async (event) => {
	const userId = await dreamsGuard(event.locals);
	const parsed = designRequestSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}
	return await askOnce(event, userId, {
		messages: designMessages(parsed.data),
		...SAMPLING.design
	});
};
