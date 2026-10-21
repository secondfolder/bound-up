import { error } from '@sveltejs/kit';
import { z } from 'zod';
import type { LiveDelta, ModelProgress, SuggestStreamEvents } from '$lib/daydream/progress';
import { encodeNamedEvent, readSseEvents } from '$lib/daydream/sse';
import { readDaydreamConfig } from '$lib/server/daydream/config';
import { daydreamGuard } from '$lib/server/daydream/guard';
import { ProgressGate } from '$lib/server/daydream/progress-gate';
import type { ModelMessage } from '$lib/server/daydream/prompt';
import {
	buildSuggestMessages,
	type Reading,
	suggestRequestSchema
} from '$lib/server/daydream/suggest-prompt';
import { type StreamApi, SuggestStream } from '$lib/server/daydream/suggest-stream';
import { hasAcceptedDisclosure } from '$lib/server/daydreams';
import { userHasFeature } from '$lib/server/features';
import { rateLimitMessage } from '$lib/server/rate-limit';
import { SSE_HEADERS, SSE_KEEPALIVE } from '$lib/server/realtime';
import type { RequestHandler } from './$types';

/**
 * Asks the model for suggestions while a character or idea is being set
 * up: more chips for a field, the empty fields filled in, or a whole idea
 * for "Surprise me"; and, for a daydream, who a character is in it, its
 * name, or the whole of it from a sentence on the new-daydream page.
 *
 * **The second place the server handles what a user wrote in plaintext**,
 * under exactly the rules of `../[id]/reply`: the disclosure must have been
 * accepted, the text is forwarded and the answer passed back, nothing is
 * stored, and nothing but a status code is ever logged. See
 * docs/daydreams.md, "What the server sees".
 *
 * A brief's links are read when the story model calls tools: OpenRouter's
 * `web_fetch` server tool is sent with the request (`readingLinks`), and
 * OpenRouter fetches them while the model answers, so this is still the one
 * call. The links go
 * to OpenRouter and its fetch engine, and nowhere else from here. See
 * docs/daydreams.md, "Links in a brief".
 *
 * Streamed, though a suggestion is useless until it is whole: a draft that
 * reads links can take most of a minute, and a page that says nothing for
 * that long looks broken. The provider's stream is read here
 * (`SuggestStream`) rather than passed on, and the browser is sent events of
 * its own (`SuggestStreamEvents`): `progress` — what the model is doing and
 * how many characters it has written, never which — then `done` with the
 * answer put back in the shape a call that was not streamed answers, which
 * the browser checks (`$lib/daydream/suggestions.ts`), or `failed`. An
 * account holding debug mode that asks (`live: 'full'`) also gets the request
 * and every piece as it comes, for the live chat. Failures before the stream
 * starts are plain JSON with a status, as they always were. See
 * docs/daydreams.md, "Progress while it writes".
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
	const raw: unknown = await request.json().catch(() => null);
	const parsed = suggestRequestSchema.safeParse(raw);
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

	const { messages, maxTokens, temperature, reading } = buildSuggestMessages(parsed.data, {
		canReadLinks: config.readsLinks
	});
	const api: StreamApi = reading ? 'responses' : 'chat/completions';
	// Stringified once, so debug mode's chat log shows the very text that was sent.
	const body = JSON.stringify(
		reading
			? readingLinks(config.openrouterModelId, messages, maxTokens, temperature, reading)
			: {
					model: config.openrouterModelId,
					messages,
					max_tokens: maxTokens,
					// From the task: hotter for the ideas round, whose variety is the point.
					temperature,
					// Ignored by a provider that does not support it; the browser
					// copes with a fenced or chatty answer either way.
					response_format: { type: 'json_object' },
					provider: { data_collection: 'deny' },
					stream: true
				}
	);
	// Whether this account holds debug mode, which is what decides whether it
	// is sent what it asks for of it: the feature, not the device's switch,
	// which only decides what is shown.
	const debug = await userHasFeature(locals.db, userId, 'debugMode');
	// Ended by the browser leaving as much as by the request's own signal:
	// the body is the stream's to read, so cancelling it cannot reach upstream.
	const stop = new AbortController();
	let upstream: Response;
	try {
		upstream = await fetch(`${config.baseUrl}/${api}`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${config.apiKey}`,
				'content-type': 'application/json'
			},
			body,
			signal: AbortSignal.any([request.signal, stop.signal])
		});
	} catch (cause) {
		// Not the error itself, for the reason the reply endpoint gives.
		console.error('[daydreams] the model provider could not be reached for a suggestion');
		return unavailable(
			debug,
			`The model provider could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`
		);
	}

	if (!(upstream.ok && upstream.body)) {
		// The status only. The body of an error can quote the request back.
		console.error(`[daydreams] the model provider answered ${upstream.status} to a suggestion`);
		const answered = await upstream.text().catch(() => '');
		return unavailable(
			debug,
			`The model provider answered ${upstream.status}:\n${answered.slice(0, MAX_FAILURE_DETAIL) || '(nothing)'}`
		);
	}

	// The chat log kept with a draft or ideas, and the live chat any suggestion
	// can ask for.
	const withLog =
		debug &&
		(parsed.data.task === 'daydream' || parsed.data.task === 'ideas') &&
		parsed.data.debugLog === true;
	const live = debug && liveSchema.safeParse(raw).data?.live === 'full';

	return new Response(
		answerStream(upstream.body, api, stop, {
			request: body,
			withLog,
			live,
			debug,
			// Whether the provider honoured `stream`: one that did not sends the whole answer.
			whole: !upstream.headers.get('content-type')?.includes('text/event-stream')
		}),
		{ headers: SSE_HEADERS }
	);
};

/** The request's ask for the live chat: any task may make it. */
const liveSchema = z.object({ live: z.literal('full').optional() });

/** How often the progress line is told how far along it is, at most. */
const PROGRESS_EVERY_MS = 250;
/** How often a quiet stream is kept open: a page being read can take a while. */
const KEEPALIVE_EVERY_MS = 15_000;

/**
 * The browser's stream: the provider's, read as it comes (`SuggestStream`)
 * and told on as `SuggestStreamEvents`. `request` is the body sent: added to
 * the answer as `boundUpRequest` with `withLog` (debug mode's chat log, kept
 * with the daydream), and sent first with `live`, which also sends every
 * piece as it comes. Both are only ever true for an account holding debug mode.
 */
function answerStream(
	upstream: ReadableStream<Uint8Array>,
	api: StreamApi,
	stop: AbortController,
	options: { request: string; withLog: boolean; live: boolean; debug: boolean; whole: boolean }
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let open = true;
	let keepAlive: ReturnType<typeof setInterval> | undefined;
	return new ReadableStream<Uint8Array>({
		async start(controller) {
			const write = (chunk: string) => {
				if (!open) {
					return;
				}
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					// Closed under us: the browser has gone.
					open = false;
				}
			};
			const send = <K extends keyof SuggestStreamEvents>(name: K, data: SuggestStreamEvents[K]) =>
				write(encodeNamedEvent(name, data));
			const finish = () => {
				clearInterval(keepAlive);
				if (open) {
					open = false;
					controller.close();
				}
			};
			keepAlive = setInterval(() => write(SSE_KEEPALIVE), KEEPALIVE_EVERY_MS);

			if (options.live) {
				send('request', { body: options.request });
			}
			const reader = new SuggestStream(api);
			send('progress', reader.progress);
			const gate = new ProgressGate(PROGRESS_EVERY_MS);
			gate.shouldSend(reader.progress);

			let ended: { ok: true; answer: unknown } | { ok: false; detail: string };
			try {
				if (options.whole) {
					ended = await wholeAnswer(upstream);
				} else {
					for await (const event of readSseEvents(upstream)) {
						const deltas: LiveDelta[] = reader.read(event);
						if (options.live) {
							for (const delta of deltas) {
								send('delta', delta);
							}
						}
						const progress: ModelProgress = reader.progress;
						if (gate.shouldSend(progress)) {
							send('progress', progress);
						}
					}
					ended = reader.end();
				}
			} catch (cause) {
				if (!open) {
					// The browser went away (Stop, or leaving); nobody is waiting.
					return;
				}
				// The status only, as above; a dropped connection's message can carry the URL.
				console.error('[daydreams] the model provider’s stream for a suggestion broke off');
				ended = {
					ok: false,
					detail: `The model provider’s stream broke off: ${cause instanceof Error ? cause.message : String(cause)}`
				};
			}
			if (ended.ok) {
				send('progress', reader.progress);
				send('done', options.withLog ? withRequest(ended.answer, options.request) : ended.answer);
			} else {
				send('failed', failure(options.debug, ended.detail));
			}
			finish();
		},
		// The reader going away (Stop, or leaving) ends the request upstream too.
		cancel(reason) {
			open = false;
			clearInterval(keepAlive);
			stop.abort(reason);
		}
	});
}

/** The answer from a provider that did not stream it, read whole. */
async function wholeAnswer(
	upstream: ReadableStream<Uint8Array>
): Promise<{ ok: true; answer: unknown } | { ok: false; detail: string }> {
	const text = await new Response(upstream).text();
	try {
		return { ok: true, answer: JSON.parse(text) };
	} catch {
		// Passed on as it came: the browser describes an answer it cannot use.
		return { ok: true, answer: text };
	}
}

/**
 * The answer with the request body the server sent added to it as
 * `boundUpRequest`, for debug mode's chat log of how a draft or ideas were
 * written (`suggestionLog`, docs/debug-mode.md). Like the reply endpoint's,
 * it is the server's prompt and the user's own brief going back to the user
 * who sent them, without the key, which is a header; nothing is kept or
 * logged. Added to the answer rather than wrapped round it, so every reader
 * of an answer reads this one unchanged; an answer that is not a JSON object
 * has nowhere to put it and goes back as it came.
 */
function withRequest(answer: unknown, request: string): unknown {
	if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
		return answer;
	}
	return { ...answer, boundUpRequest: request };
}

/**
 * OpenRouter's fetch tool, for the links in a brief. Parallel's engine
 * because it is the one that reads reddit, which briefs link most: measured
 * 2026-10-20, Exa answered nothing for a subreddit, Firecrawl refuses reddit
 * outright, and OpenRouter's own fetch hands back raw RSS when it gets
 * anything. $1 per 1,000 fetches, on top of the tokens. Each page is cut
 * short, so a brief cannot fill the context.
 *
 * The model picks every URL it fetches, so a page it reads could send it on
 * to one of the page's choosing with the brief in the query string. Only the
 * sites the brief's own links are on can be opened (`allowed_domains`), and
 * only as many pages as the prompt says (`max_uses`, `pagesToRead`): the
 * brief's links, and a few that an index among them leads to.
 */
function webFetch(reading: Reading) {
	return {
		type: 'openrouter:web_fetch',
		parameters: {
			engine: 'parallel',
			max_uses: reading.maxPages,
			max_content_tokens: 6000,
			allowed_domains: reading.hosts
		}
	} as const;
}

/**
 * The request for a suggestion that reads a brief's links: the same one, sent
 * to OpenRouter's Responses API rather than Chat Completions, because only
 * its answer lists each fetch — the URL, whether it was read, and what came
 * back or why not — for debug mode's chat log (`suggestionLog`); Chat Completions
 * says only how many there were. The browser reads both shapes, and
 * `SuggestStream` reads both streams.
 */
function readingLinks(
	model: string,
	messages: ModelMessage[],
	maxTokens: number,
	temperature: number,
	reading: Reading
) {
	return {
		model,
		input: messages,
		max_output_tokens: maxTokens,
		temperature,
		text: { format: { type: 'json_object' } },
		provider: { data_collection: 'deny' },
		tools: [webFetch(reading)],
		stream: true
	};
}

/** The most of a provider's error passed on to debug mode. */
const MAX_FAILURE_DETAIL = 4000;

const UNAVAILABLE = 'No suggestions just now. Try again in a moment.';

/**
 * "No suggestions just now", and for an account holding debug mode what went
 * wrong with the provider, for `SuggestionProblem` to show (docs/debug-mode.md).
 * Only to that account: the provider's error can quote the request back,
 * which is the user's own text and theirs to see, but it is detail nobody
 * else's page has any use for. The feature is what decides, not the device's
 * debug switch, which only decides what is shown. Never logged.
 */
function failure(debug: boolean, detail: string): SuggestStreamEvents['failed'] {
	return { message: UNAVAILABLE, ...(debug ? { detail } : {}) };
}

/** The same, before the stream has started: a 502. */
function unavailable(debug: boolean, detail: string) {
	return new Response(JSON.stringify(failure(debug, detail)), {
		status: 502,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
}
