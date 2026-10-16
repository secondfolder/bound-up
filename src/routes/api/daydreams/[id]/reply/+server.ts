import { error } from '@sveltejs/kit';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { buildMessages, replyRequestSchema } from '$lib/server/daydream/prompt';
import { hasAcceptedDisclosure, ownsDaydream } from '$lib/server/daydreams';
import { requireFeature } from '$lib/server/features';
import { rateLimitMessage } from '$lib/server/rate-limit';
import { SSE_HEADERS } from '$lib/server/realtime';
import type { RequestHandler } from './$types';

/**
 * Asks the model for the character's next reply, and streams it back.
 *
 * **The one place the server handles what a user wrote in plaintext.** The
 * browser posts the setup and the recent conversation as text, because the
 * model needs the words and the server cannot open the sealed copies; this
 * forwards them to OpenRouter and pipes the answer straight back. Nothing
 * here stores, logs or inspects either: errors are logged by status code
 * alone, and the request body never reaches `console`. The browser seals the
 * finished reply and saves it through `../turns`. The user is told all this,
 * and has accepted it, before the first request is allowed
 * (`hasAcceptedDisclosure`). See docs/daydreams.md, "What the server sees".
 *
 * The answer is OpenRouter's own server-sent events, passed through
 * untouched rather than parsed and re-encoded: the browser parses them
 * (`$lib/daydream/stream.ts`), and the worker spends no CPU on a reply it
 * has no reason to read.
 */
export const POST: RequestHandler = async ({ locals, params, platform, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const userId = locals.user.id;
	await requireFeature(locals.db, userId, 'daydreams');

	const config = readDaydreamConfig(platform);
	if (!config) {
		// The pages say so before anyone gets this far, so reaching here is a
		// stale page rather than something to explain.
		error(503, 'Daydreams are not set up on this server.');
	}
	if (!(await ownsDaydream(locals.db, userId, params.id))) {
		error(404, 'That daydream is not there any more.');
	}
	if (!(await hasAcceptedDisclosure(locals.db, userId))) {
		error(409, 'Read and accept how Daydreams works first.');
	}

	// Parsed before the limit is counted, so a stale page sending something
	// malformed does not use up the user's replies.
	const parsed = replyRequestSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}

	const limited = await locals.daydreamRateLimit(userId);
	if (!limited.allowed) {
		return new Response(JSON.stringify({ message: rateLimitMessage(limited.retryAfterSeconds) }), {
			status: 429,
			headers: {
				'content-type': 'application/json',
				'retry-after': String(limited.retryAfterSeconds)
			}
		});
	}

	let upstream: Response;
	try {
		upstream = await fetch(`${config.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${config.apiKey}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				model: config.model,
				messages: buildMessages(parsed.data),
				stream: true,
				// A few paragraphs, which is what the rules ask for; also the
				// most one reply can cost.
				max_tokens: 900,
				temperature: 0.9,
				// Only route to providers that do not keep or train on prompts.
				provider: { data_collection: 'deny' }
			}),
			// The user pressing Stop, or leaving, ends the request upstream too,
			// so a reply nobody will read is not paid for to the end.
			signal: request.signal
		});
	} catch {
		// Not the error itself: a fetch failure's message can carry the URL,
		// and on some runtimes more of the request than that.
		console.error('[daydreams] the model provider could not be reached');
		error(502, 'The reply could not be written just now. Try again in a moment.');
	}

	if (!(upstream.ok && upstream.body)) {
		// The status only. The body of an error can quote the request back.
		console.error(`[daydreams] the model provider answered ${upstream.status}`);
		await upstream.body?.cancel();
		error(502, 'The reply could not be written just now. Try again in a moment.');
	}

	return new Response(upstream.body, { headers: SSE_HEADERS });
};
