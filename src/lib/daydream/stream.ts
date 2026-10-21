/**
 * Reading a reply as it arrives.
 *
 * The reply endpoint passes OpenRouter's server-sent events through untouched
 * (see its comment for why), so this is a reader for the OpenAI-compatible
 * stream format: `data: {json}` events, each carrying a piece of the reply in
 * `choices[0].delta.content`, ending with `data: [DONE]`. OpenRouter also
 * sends `: comment` lines to keep the connection open, and an error that
 * happens mid-reply arrives as an event with an `error` field rather than as
 * an HTTP status, because the status was sent long before.
 *
 * Pure: it takes bytes and calls back with text, so it is tested without a
 * network. `EventSource` cannot be used, because it can only send a GET.
 */

import { reasoningIn } from './exchange-log';

export type StreamOutcome =
	/**
	 * The stream said it was done, or simply ended. `outOfRoom` when the
	 * model stopped at `max_tokens` (`finish_reason: "length"`): a reasoning
	 * model can spend the whole budget thinking and send no text at all,
	 * which without this reads the same as a model that chose to say nothing.
	 */
	| { kind: 'done'; outOfRoom?: true }
	/** The provider reported a failure partway through. */
	| { kind: 'error' };

const LINE_BREAK = /\r?\n/;

type StreamEvent = {
	choices?: { delta?: Record<string, unknown>; finish_reason?: unknown }[];
	error?: unknown;
	/** The reply endpoint's own event, first, for debug mode: the request body it sent the model. */
	boundUpRequest?: unknown;
};

/**
 * Feeds every piece of reply text in `body` to `onText`, in order, and says
 * how the stream ended. Rejects only as the read does: an abort, or the
 * connection dropping.
 */
export async function readReplyStream(
	body: ReadableStream<Uint8Array>,
	onText: (piece: string) => void,
	/** Given the request body the endpoint sent the model, when it was asked to record it. */
	onRequest: (body: string) => void = () => undefined,
	/** Given each piece of the model's reasoning, where the provider shows it, for the progress line. */
	onReasoning: (piece: string) => void = () => undefined
): Promise<StreamOutcome> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffered = '';
	// Set by the event that carries `finish_reason`, which comes before `[DONE]`.
	const ending: { outOfRoom: boolean } = { outOfRoom: false };
	const done = (): StreamOutcome =>
		ending.outOfRoom ? { kind: 'done', outOfRoom: true } : { kind: 'done' };
	try {
		for (;;) {
			const { done: finished, value } = await reader.read();
			buffered += finished ? decoder.decode() : decoder.decode(value, { stream: true });
			// Events end at a blank line; a line may arrive split across chunks,
			// so only complete lines are handled and the rest waits.
			const lines = buffered.split(LINE_BREAK);
			buffered = finished ? '' : (lines.pop() ?? '');
			for (const line of lines) {
				const outcome = handleLine(line, { onText, onRequest, onReasoning }, ending);
				if (outcome === 'done') {
					return done();
				}
				if (outcome) {
					return outcome;
				}
			}
			if (finished) {
				return done();
			}
		}
	} finally {
		reader.releaseLock();
	}
}

function handleLine(
	line: string,
	{
		onText,
		onRequest,
		onReasoning
	}: {
		onText: (piece: string) => void;
		onRequest: (body: string) => void;
		onReasoning: (piece: string) => void;
	},
	ending: { outOfRoom: boolean }
): { kind: 'error' } | 'done' | null {
	if (!line.startsWith('data:')) {
		// Blank separators, `: keep-alive` comments, `event:` and `id:` fields.
		return null;
	}
	const data = line.slice('data:'.length).trim();
	if (data === '[DONE]') {
		return 'done';
	}
	let event: StreamEvent;
	try {
		event = JSON.parse(data) as StreamEvent;
	} catch {
		// Not an event this reader understands; the rest of the reply still is.
		return null;
	}
	if (event.boundUpRequest !== undefined) {
		if (typeof event.boundUpRequest === 'string') {
			onRequest(event.boundUpRequest);
		}
		return null;
	}
	if (event.error) {
		return { kind: 'error' };
	}
	if (event.choices?.[0]?.finish_reason === 'length') {
		ending.outOfRoom = true;
	}
	const delta = event.choices?.[0]?.delta;
	if (!delta) {
		return null;
	}
	const thought = reasoningIn(delta).text;
	if (thought) {
		onReasoning(thought);
	}
	const piece = delta.content;
	if (typeof piece === 'string' && piece !== '') {
		onText(piece);
	}
	return null;
}
