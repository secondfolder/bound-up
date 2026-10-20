/**
 * Keeping one reply request's exchange as it happens (`exchange.ts`): the
 * request body the endpoint says it sent, and a copy of the response stream
 * taken before anything reads it, so what is kept is every byte that
 * arrived, not what the reader made of it.
 *
 * The copy is one branch of a `tee()`; the other is the one the page reads
 * (`writeReply` in `client.ts`). It keeps what had arrived when the request
 * is stopped or the connection drops, as the passage does.
 *
 * Pure but for the stream it is handed, so it is tested without a network.
 */

import { EXCHANGE_LIMITS, type Exchange, type ExchangeEnding } from './exchange';

const OWN_EVENT = 'data: {"boundUpRequest":';

/**
 * The stream as the provider sent it: the reply endpoint's own first event
 * cut off. That event is one line (`JSON.stringify` escapes every newline in
 * the body it carries), so it ends at the first blank line.
 */
export function stripOwnEvent(body: string): string {
	if (!body.startsWith(OWN_EVENT)) {
		// Stopped before even that had all arrived: nothing of the provider's came.
		return OWN_EVENT.startsWith(body) ? '' : body;
	}
	const end = body.indexOf('\n\n');
	return end === -1 ? '' : body.slice(end + 2);
}

export class ExchangeRecorder {
	readonly startedAt: number;
	#request: string | null = null;
	#status = 0;
	readonly #pieces: string[] = [];
	#copied: Promise<void> = Promise.resolve();

	constructor(now = Date.now()) {
		this.startedAt = now;
	}

	/** The request body, from the endpoint's own first event. */
	request(body: string): void {
		this.#request = body;
	}

	/** Copies `stream` as it arrives: one branch of the response's `tee()`. */
	capture(status: number, stream: ReadableStream<Uint8Array>): void {
		this.#status = status;
		this.#copied = this.#copy(stream);
	}

	async #copy(stream: ReadableStream<Uint8Array>): Promise<void> {
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) {
					this.#pieces.push(decoder.decode());
					return;
				}
				this.#pieces.push(decoder.decode(value, { stream: true }));
			}
		} catch {
			// Stopped, or the connection dropped: what had arrived is kept.
		} finally {
			reader.releaseLock();
		}
	}

	/**
	 * The exchange, once the copy has everything it will get, or null when
	 * there is none to keep: the endpoint did not send the request, because
	 * the account does not hold debug mode or this was not a recording request.
	 */
	async exchange(ended: ExchangeEnding, now: () => number = Date.now): Promise<Exchange | null> {
		await this.#copied;
		if (this.#request === null) {
			return null;
		}
		const whole = stripOwnEvent(this.#pieces.join(''));
		const body = whole.slice(0, EXCHANGE_LIMITS.response);
		return {
			endpoint: 'chat/completions',
			request: this.#request.slice(0, EXCHANGE_LIMITS.request),
			response: {
				status: this.#status,
				body,
				...(body.length < whole.length ? { truncated: true as const } : {})
			},
			ended,
			startedAt: this.startedAt,
			endedAt: now()
		};
	}
}
