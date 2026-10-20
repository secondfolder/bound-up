import { error } from '@sveltejs/kit';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { daydreamGuard } from '$lib/server/daydream/guard';
import type { ModelMessage } from '$lib/server/daydream/prompt';
import {
	buildSuggestMessages,
	MAX_BRIEF_LINKS,
	suggestRequestSchema
} from '$lib/server/daydream/suggest-prompt';
import { hasAcceptedDisclosure } from '$lib/server/daydreams';
import { userHasFeature } from '$lib/server/features';
import { rateLimitMessage } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

/**
 * Asks the model for suggestions while a character or idea is being set
 * up: more chips for a field, the empty fields filled in, or a whole idea
 * for "Surprise me"; and, for a daydream, who a character is in it, its
 * name, or the whole of it from a sentence on the new-daydream page.
 *
 * **The second place the server handles what a user wrote in plaintext**,
 * under exactly the rules of `../[id]/reply`: the disclosure must have been
 * accepted, the text is forwarded and the answer passed straight back,
 * nothing is stored, and nothing but a status code is ever logged. See
 * docs/daydreams.md, "What the server sees".
 *
 * A brief's links are read when the story model calls tools: OpenRouter's
 * `web_fetch` server tool is sent with the request (`readingLinks`), and
 * OpenRouter fetches them while the model answers, so this is still the one
 * call. The links go
 * to OpenRouter and its fetch engine, and nowhere else from here. See
 * docs/daydreams.md, "Links in a brief".
 *
 * Not streamed: a suggestion is a small JSON answer, useless until it is
 * whole. The provider's response is passed through unread; the browser
 * checks it (`$lib/daydream/suggestions.ts`). The one exception is debug
 * mode's chat log, which has the request it answered added to it (`withRequest`).
 */
export const POST: RequestHandler = async ({ locals, platform, request }) => {
	const userId = await daydreamGuard(locals);

	const config = readDaydreamConfig(locals.settings, platform);
	if (!config) {
		error(503, 'Daydreams are not set up on this server.');
	}
	if (!(await hasAcceptedDisclosure(locals.db, userId))) {
		error(409, 'Read and accept how Daydreams works first.');
	}

	// Parsed before the limit is counted, as the replies are.
	const parsed = suggestRequestSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}

	const limited = await locals.daydreamSuggestRateLimit(userId);
	if (!limited.allowed) {
		return new Response(JSON.stringify({ message: rateLimitMessage(limited.retryAfterSeconds) }), {
			status: 429,
			headers: {
				'content-type': 'application/json',
				'retry-after': String(limited.retryAfterSeconds)
			}
		});
	}

	const { messages, maxTokens, readLinks } = buildSuggestMessages(parsed.data, {
		canReadLinks: config.readsLinks
	});
	// Stringified once, so debug mode's chat log shows the very text that was sent.
	const body = JSON.stringify(
		readLinks
			? readingLinks(config.openrouterModelId, messages, maxTokens)
			: {
					model: config.openrouterModelId,
					messages,
					max_tokens: maxTokens,
					temperature: 1,
					// Ignored by a provider that does not support it; the browser
					// copes with a fenced or chatty answer either way.
					response_format: { type: 'json_object' },
					provider: { data_collection: 'deny' }
				}
	);
	let upstream: Response;
	try {
		upstream = await fetch(`${config.baseUrl}/${readLinks ? 'responses' : 'chat/completions'}`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${config.apiKey}`,
				'content-type': 'application/json'
			},
			body,
			signal: request.signal
		});
	} catch (cause) {
		// Not the error itself, for the reason the reply endpoint gives.
		console.error('[daydreams] the model provider could not be reached for a suggestion');
		return unavailable(
			locals.db,
			userId,
			`The model provider could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`
		);
	}

	if (!(upstream.ok && upstream.body)) {
		// The status only. The body of an error can quote the request back.
		console.error(`[daydreams] the model provider answered ${upstream.status} to a suggestion`);
		const answered = await upstream.text().catch(() => '');
		return unavailable(
			locals.db,
			userId,
			`The model provider answered ${upstream.status}:\n${answered.slice(0, MAX_FAILURE_DETAIL) || '(nothing)'}`
		);
	}

	if (
		(parsed.data.task === 'daydream' || parsed.data.task === 'ideas') &&
		parsed.data.debugLog &&
		(await userHasFeature(locals.db, userId, 'debugMode'))
	) {
		return withRequest(await upstream.text(), body);
	}

	return new Response(upstream.body, {
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
};

/**
 * The provider's answer with the request body the server sent added to it as
 * `boundUpRequest`, for debug mode's chat log of how a draft or ideas were
 * written (`suggestionLog`, docs/debug-mode.md). Like the reply endpoint's,
 * it is the server's prompt and the user's own brief going back to the user
 * who sent them, without the key, which is a header; nothing is kept or
 * logged. Added to the answer rather than wrapped round it, so every reader
 * of an answer reads this one unchanged; an answer that is not a JSON object
 * has nowhere to put it and goes back as it came.
 */
function withRequest(answer: string, request: string): Response {
	const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
	let parsed: unknown;
	try {
		parsed = JSON.parse(answer);
	} catch {
		return new Response(answer, { headers });
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		return new Response(answer, { headers });
	}
	return new Response(JSON.stringify({ ...parsed, boundUpRequest: request }), { headers });
}

/**
 * OpenRouter's fetch tool, for the links in a brief. Parallel's engine
 * because it is the one that reads reddit, which briefs link most: measured
 * 2026-10-20, Exa answered nothing for a subreddit, Firecrawl refuses reddit
 * outright, and OpenRouter's own fetch hands back raw RSS when it gets
 * anything. $1 per 1,000 fetches, on top of the tokens. One fetch a link, and
 * each page cut short, so a brief cannot fill the context.
 */
const WEB_FETCH = {
	type: 'openrouter:web_fetch',
	parameters: { engine: 'parallel', max_uses: MAX_BRIEF_LINKS, max_content_tokens: 6000 }
} as const;

/**
 * The request for a suggestion that reads a brief's links: the same one, sent
 * to OpenRouter's Responses API rather than Chat Completions, because only
 * its answer lists each fetch — the URL, whether it was read, and what came
 * back or why not — for debug mode's chat log (`suggestionLog`); Chat Completions
 * says only how many there were. The browser reads both shapes, so the
 * answer is still passed back unread.
 */
function readingLinks(model: string, messages: ModelMessage[], maxTokens: number) {
	return {
		model,
		input: messages,
		max_output_tokens: maxTokens,
		temperature: 1,
		text: { format: { type: 'json_object' } },
		provider: { data_collection: 'deny' },
		tools: [WEB_FETCH]
	};
}

/** The most of a provider's error passed on to debug mode. */
const MAX_FAILURE_DETAIL = 4000;

/**
 * "No suggestions just now", and for an account holding debug mode what went
 * wrong with the provider, for `SuggestionProblem` to show (docs/debug-mode.md).
 * Only to that account: the provider's error can quote the request back,
 * which is the user's own text and theirs to see, but it is detail nobody
 * else's page has any use for. The feature is what decides, not the device's
 * debug switch, which only decides what is shown. Never logged.
 */
async function unavailable(db: App.Locals['db'], userId: string, detail: string) {
	const debug = await userHasFeature(db, userId, 'debugMode');
	return new Response(
		JSON.stringify({
			message: 'No suggestions just now. Try again in a moment.',
			...(debug ? { detail } : {})
		}),
		{ status: 502, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }
	);
}
