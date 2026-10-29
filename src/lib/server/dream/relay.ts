/**
 * Streams one model reply to the browser as the engine's own events
 * (`../../dream/events.ts`), with the adult-content routing around it
 * (docs/dreams.md, "Adult-friendly providers"):
 *
 * - Each attempt is pinned to one provider endpoint, so its outcome can be
 *   credited to it (`record`), which is what backs off a provider that has
 *   started refusing.
 * - A reply that comes back refused, filtered or empty, or a request that
 *   fails before any words, is tried once more on the next provider, and the
 *   browser told to drop what it had (`restart`).
 * - A failure after words have arrived keeps them: the page offers Retry.
 *
 * With no checked provider to pin to, the request goes unpinned and nothing
 * is recorded. Nothing here logs the request or the reply: errors are
 * reported to the browser in words of our own.
 *
 * Alias-free, like the rest of `server/dream`.
 */

import { type DreamEvent, type Ended, encodeEvent } from '../../dream/events';
import { isAllowedPage } from '../../dream/links';
import { classifyReply, type ReplyOutcome } from '../../model-providers';
import {
	type Completion,
	type CompletionRequest,
	type Fetched,
	stream as openRouterStream
} from './openrouter';

export type RelayOptions = {
	request: Omit<CompletionRequest, 'providers' | 'model'>;
	/** The model as listed, for pinned attempts. */
	listedModel: string;
	/** The model as configured (a preset included), for an unpinned one. */
	configuredModel: string;
	/** Eligible endpoints, best first; empty sends one unpinned attempt. */
	providers: readonly string[];
	/** Credits an attempt's outcome to its endpoint. */
	record: (provider: string, outcome: ReplyOutcome) => Promise<void>;
	/** How many providers to try before giving up. */
	attempts?: number;
	/** The completion call: Chat Completions by default; a step with tools passes its own. */
	stream?: (
		request: CompletionRequest,
		onText: (text: string) => void,
		onFetch: (fetched: Fetched) => void
	) => Promise<Completion>;
	/** The sites a fetch may read from; a page elsewhere is shown as not allowed. */
	hosts?: readonly string[];
};

function endedFor(outcome: ReplyOutcome, finishReason: string | null): Ended {
	if (outcome === 'refused' || outcome === 'filtered') {
		return 'refused';
	}
	return finishReason === 'length' ? 'stopped' : 'complete';
}

const FAILED_MESSAGE = 'The story could not be written just now. Try again in a moment.';

/** The reply as a stream of event bytes, ready to be a response body. */
export function relay(options: RelayOptions): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	const call = options.stream ?? openRouterStream;
	const pinned = options.providers.slice(0, options.attempts ?? 2);
	const plan: (string | null)[] = pinned.length > 0 ? pinned : [null];

	// Set when the reader goes; nothing is sent after it.
	let cancelled = false;
	return new ReadableStream<Uint8Array>({
		async start(controller) {
			let open = true;
			const send = (event: DreamEvent) => {
				// The reader may have gone (Stop, or leaving) while a call finished.
				if (open && !cancelled) {
					controller.enqueue(encoder.encode(encodeEvent(event)));
				}
			};
			const close = () => {
				if (open && !cancelled) {
					open = false;
					controller.close();
				}
			};
			for (const [index, provider] of plan.entries()) {
				const last = index === plan.length - 1;
				let wrote = false;
				let completion: Completion;
				try {
					completion = await call(
						{
							...options.request,
							model: provider ? options.listedModel : options.configuredModel,
							...(provider ? { providers: [provider] } : {})
						},
						(text) => {
							wrote = true;
							send({ type: 'text', text });
						},
						(fetched) =>
							send({
								type: 'fetch',
								url: fetched.url,
								ok: fetched.ok,
								allowed: isAllowedPage(fetched.url, options.hosts ?? [])
							})
					);
				} catch {
					// Stopped by the user: nobody's fault, and nothing to send.
					if (options.request.signal?.aborted || cancelled) {
						close();
						return;
					}
					if (provider) {
						await options.record(provider, 'error').catch(() => undefined);
					}
					if (wrote || last) {
						send({ type: 'failed', message: FAILED_MESSAGE });
						close();
						return;
					}
					send({ type: 'restart', reason: 'failed' });
					continue;
				}
				const outcome = classifyReply(completion.text, completion.finishReason);
				if (provider) {
					await options.record(provider, outcome).catch(() => undefined);
				}
				if (outcome === 'complied' || last) {
					send({
						type: 'done',
						ended: endedFor(outcome, completion.finishReason),
						model: options.listedModel,
						provider: provider ?? completion.provider ?? ''
					});
					close();
					return;
				}
				send({ type: 'restart', reason: outcome === 'error' ? 'failed' : 'refused' });
			}
		},
		cancel() {
			cancelled = true;
		}
	});
}
