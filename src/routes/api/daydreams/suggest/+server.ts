import { error } from '@sveltejs/kit';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { daydreamGuard } from '$lib/server/daydream/guard';
import { buildSuggestMessages, suggestRequestSchema } from '$lib/server/daydream/suggest-prompt';
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
 * Not streamed: a suggestion is a small JSON answer, useless until it is
 * whole. The provider's response is passed through unread; the browser
 * checks it (`$lib/daydream/suggestions.ts`).
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

	const { messages, maxTokens } = buildSuggestMessages(parsed.data);
	let upstream: Response;
	try {
		upstream = await fetch(`${config.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${config.apiKey}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				model: config.openrouterModelId,
				messages,
				max_tokens: maxTokens,
				temperature: 1,
				// Ignored by a provider that does not support it; the browser
				// copes with a fenced or chatty answer either way.
				response_format: { type: 'json_object' },
				provider: { data_collection: 'deny' }
			}),
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
		const body = await upstream.text().catch(() => '');
		return unavailable(
			locals.db,
			userId,
			`The model provider answered ${upstream.status}:\n${body.slice(0, MAX_FAILURE_DETAIL) || '(nothing)'}`
		);
	}

	return new Response(upstream.body, {
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
};

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
