import { error } from '@sveltejs/kit';
import { asksForResearch, briefLinks, pagesToRead, readableHosts } from '$lib/dream/links';
import { readRequestSchema } from '$lib/dream/requests';
import { readingMessages } from '$lib/server/dream/prompts/reading';
import { SAMPLING } from '$lib/server/dream/sampling';
import {
	dreamModel,
	dreamsGuard,
	type Lookups,
	looksUp,
	researchFirst,
	streamStory
} from '$lib/server/dream-api';
import type { RequestHandler } from './$types';

/**
 * Step 1, reading the brief (docs/dreams.md, "Reading the brief"), streamed
 * so the setup page can show each part as it closes.
 *
 * Research (docs/dreams.md, "Research"): a brief's links are read, and a
 * brief that asks for something looked up may be searched for. A story
 * model that calls tools does it itself, through the Responses API; one
 * that cannot has the research model do it first, when one is set, and is
 * given what it wrote; otherwise the links go as text, and the model is
 * told not to guess at them.
 */
export const POST: RequestHandler = async (event) => {
	const userId = await dreamsGuard(event.locals);
	// Parsed before the limit is counted, so a stale page does not use it up.
	const parsed = readRequestSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}
	const input = parsed.data;
	const config = dreamModel(event.locals, event.platform);
	const lookups: Lookups = {
		fetch:
			briefLinks(input.brief).length > 0
				? { hosts: readableHosts(input.brief), maxPages: pagesToRead(input.brief) }
				: null,
		search: asksForResearch(input.brief)
	};
	if (config.readsLinks && looksUp(lookups)) {
		return await streamStory(event, userId, {
			messages: readingMessages({
				...input,
				canFetch: lookups.fetch !== null,
				canSearch: lookups.search
			}),
			...SAMPLING.reading,
			lookups
		});
	}
	if (config.researchModel && looksUp(lookups)) {
		return await streamStory(event, userId, async (send, signal) => {
			const research = await researchFirst(
				event.locals,
				config,
				{ brief: input.brief, lookups },
				send,
				signal
			);
			return {
				messages: readingMessages({ ...input, canFetch: false, research: research ?? undefined }),
				...SAMPLING.reading
			};
		});
	}
	return await streamStory(event, userId, {
		messages: readingMessages({ ...input, canFetch: false }),
		...SAMPLING.reading
	});
};
