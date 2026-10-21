/**
 * How a daydream was set up: the suggestion requests that wrote its draft,
 * kept with it for debug mode's raw log (docs/debug-mode.md, "Setup
 * exchanges"). The draft's own, and for a draft written from a generated
 * idea, the round of ideas that offered it — which is where a brief's links
 * were read, so often where a thin draft came from.
 *
 * Kept as they went and read when drawn (`setupExchangeLog`), like a
 * daydream's own exchanges (`exchange.ts`), so a better reader shows more of
 * every one already kept. Not quite verbatim on the answer's side: the suggest
 * endpoint answers with one JSON body, which the page has parsed by the time
 * it has a log to keep, so `response.body` is that answer stringified again —
 * the same answer, not its bytes. The request is the very string the server
 * sent.
 *
 * Sealed as `daydream-setup-exchange`, a kind of its own rather than a
 * version of `daydream-exchange`, whose every reader takes its response to be
 * a stream of server-sent events.
 *
 * Pure and alias-free: the sealed kind imports its caps.
 */

import { EXCHANGE_LIMITS } from './exchange';

/** Which suggestion it was: the draft, or the round of ideas the draft's idea came from. */
export type SetupExchangeTask = 'daydream' | 'ideas';

export type SetupExchange = {
	task: SetupExchangeTask;
	/** The request body exactly as the server sent it (`boundUpRequest`). */
	request: string;
	response: {
		/** The answer, as JSON, without the `boundUpRequest` the endpoint added to it. */
		body: string;
		/** It ran past `EXCHANGE_LIMITS.response`, or the sealed record's cap, and only its start was kept. */
		truncated?: true;
	};
	/** When the request was sent and when its answer arrived, in milliseconds since the epoch. */
	startedAt: number;
	endedAt: number;
};

/** The most kept with one daydream: a draft, and the round of ideas it came from. */
export const MAX_SETUP_EXCHANGES = 2;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A suggestion's answer as a setup exchange, or null for one with no request
 * in it (`suggestionLog` takes the same answers): the request did not ask, or
 * the account does not hold debug mode.
 */
export function setupExchangeFrom(
	task: SetupExchangeTask,
	answer: unknown,
	timing: { startedAt: number; endedAt: number }
): SetupExchange | null {
	if (!isObject(answer) || typeof answer.boundUpRequest !== 'string') {
		return null;
	}
	const { boundUpRequest, ...rest } = answer;
	const whole = JSON.stringify(rest);
	const body = whole.slice(0, EXCHANGE_LIMITS.response);
	return {
		task,
		request: boundUpRequest.slice(0, EXCHANGE_LIMITS.request),
		response: { body, ...(body.length < whole.length ? { truncated: true as const } : {}) },
		...timing
	};
}

/**
 * The answer a setup exchange keeps, with its request put back as the suggest
 * endpoint sent it, for `suggestionLog` to read. A body cut short is no
 * longer JSON, so it comes back as the text it is, which the reader shows
 * whole.
 */
export function setupExchangeAnswer(exchange: SetupExchange): unknown {
	let body: unknown;
	try {
		body = JSON.parse(exchange.response.body);
	} catch {
		body = { unreadable: exchange.response.body };
	}
	return { ...(isObject(body) ? body : { answer: body }), boundUpRequest: exchange.request };
}
