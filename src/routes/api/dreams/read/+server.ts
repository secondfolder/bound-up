import { error } from '@sveltejs/kit';
import { briefLinks, pagesToRead, readableHosts } from '$lib/dream/links';
import { readRequestSchema } from '$lib/dream/requests';
import { readingMessages } from '$lib/server/dream/prompts/reading';
import { SAMPLING } from '$lib/server/dream/sampling';
import { dreamModel, dreamsGuard, streamStory } from '$lib/server/dream-api';
import type { RequestHandler } from './$types';

/**
 * Step 1, reading the brief (docs/dreams.md, "Reading the brief"), streamed
 * so the setup page can show each part as it closes. With links in the
 * brief and a model that calls tools, it reads them first, through the
 * Responses API, and says what each page was (docs/dreams.md, "Research").
 */
export const POST: RequestHandler = async (event) => {
	const userId = await dreamsGuard(event.locals);
	// Parsed before the limit is counted, so a stale page does not use it up.
	const parsed = readRequestSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}
	const input = parsed.data;
	// The brief's links are read only by a model that can call tools; one that
	// cannot is told so, and not to guess at them.
	const canFetch =
		dreamModel(event.locals, event.platform).readsLinks && briefLinks(input.brief).length > 0;
	return await streamStory(event, userId, {
		messages: readingMessages({ ...input, canFetch }),
		...SAMPLING.reading,
		...(canFetch
			? { fetch: { hosts: readableHosts(input.brief), maxPages: pagesToRead(input.brief) } }
			: {})
	});
};
