import { error } from '@sveltejs/kit';
import { fillRequestSchema } from '$lib/dream/requests';
import type { ModelMessage } from '$lib/server/dream/prompts/core';
import { elementsMessages, moreMessages, summaryMessages } from '$lib/server/dream/prompts/fill';
import { askOnce, dreamsGuard } from '$lib/server/dream-api';
import type { RequestHandler } from './$types';

/**
 * The small calls between passages (docs/dreams.md, "Detail on tap" and
 * "Memory"): a card filled in or facts kept, a `<more>` expanded, a scene
 * summarised. Answered whole, not streamed; the page reads the reply.
 */
export const POST: RequestHandler = async (event) => {
	const userId = await dreamsGuard(event.locals);
	const parsed = fillRequestSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}
	const input = parsed.data;
	let messages: ModelMessage[];
	let temperature: number;
	switch (input.kind) {
		case 'elements':
			messages = elementsMessages(input);
			temperature = 0.6;
			break;
		case 'more':
			messages = moreMessages(input);
			temperature = 0.9;
			break;
		default:
			messages = summaryMessages(input);
			temperature = 0.3;
	}
	return await askOnce(event, userId, {
		messages,
		temperature,
		// Short answers, with room for a reasoning model to think first.
		maxTokens: 3000
	});
};
