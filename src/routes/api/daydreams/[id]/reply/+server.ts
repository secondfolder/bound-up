import { error } from '@sveltejs/kit';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { pictureArchitectureFor, readImageConfig } from '$lib/server/daydream/image-config';
import { buildMessages, replyRequestSchema } from '$lib/server/daydream/prompt';
import { hasAcceptedDisclosure, ownsDaydream } from '$lib/server/daydreams';
import { requireFeature, userHasFeature } from '$lib/server/features';
import { rateLimitMessage } from '$lib/server/rate-limit';
import { SSE_HEADERS } from '$lib/server/realtime';
import type { RequestHandler } from './$types';

/**
 * Asks the model for the story's next passage, and streams it back.
 *
 * **One of the two places the server handles what a user wrote in plaintext**
 * (the other is `../../suggest`). The
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
 * has no reason to read. The one addition is for debug mode: asked to
 * `record`, by an account holding the feature, it sends one event of its own
 * first, `{"boundUpRequest": "…"}`, with the request body exactly as it sent
 * it, for the browser to keep with the stream as it arrived — the exchange,
 * sealed (`$lib/daydream/exchange.ts`). It is the user's own words and the
 * server's prompt going back to the user who sent them, without the key,
 * which is a header; it is never kept here.
 */
export const POST: RequestHandler = async ({ locals, params, platform, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const userId = locals.user.id;
	await requireFeature(locals.db, userId, 'daydreams');

	const config = readDaydreamConfig(locals.settings, platform);
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

	const messages = buildMessages(parsed.data, {
		pictures: pictureArchitectureFor(
			readImageConfig(locals.settings, platform),
			parsed.data.setup.pictures.style
		)
	});
	const recording =
		parsed.data.record === true && (await userHasFeature(locals.db, userId, 'debugMode'));
	// Stringified once, so what the raw log keeps is the very text that was sent.
	const body = JSON.stringify({
		model: config.openrouterModelId,
		messages,
		stream: true,
		// A few paragraphs, which is what the dials ask for at most, plus
		// the metadata block after them; also the most one reply can cost.
		max_tokens: 1200,
		temperature: 0.9,
		// Only route to providers that do not keep or train on prompts.
		provider: { data_collection: 'deny' },
		// For debug mode's raw log: the token counts and cost, in the
		// stream's last event. Not otherwise, since nothing else reads them.
		...(recording ? { usage: { include: true } } : {})
	});
	let upstream: Response;
	try {
		upstream = await fetch(`${config.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${config.apiKey}`,
				'content-type': 'application/json'
			},
			body,
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

	if (!recording) {
		return new Response(upstream.body, { headers: SSE_HEADERS });
	}
	// One line: `JSON.stringify` escapes every newline in the body, so the
	// first blank line is where this event ends and the provider's begin
	// (`stripOwnEvent` in `exchange-recorder.ts`).
	const first = new TextEncoder().encode(`data: ${JSON.stringify({ boundUpRequest: body })}\n\n`);
	const reader = upstream.body.getReader();
	let started = false;
	return new Response(
		new ReadableStream<Uint8Array>({
			async pull(controller) {
				if (!started) {
					started = true;
					controller.enqueue(first);
					return;
				}
				const { done, value } = await reader.read();
				if (done) {
					controller.close();
				} else {
					controller.enqueue(value);
				}
			},
			// The reader going away (Stop, or leaving) ends the request upstream.
			cancel: (reason) => reader.cancel(reason)
		}),
		{ headers: SSE_HEADERS }
	);
};
