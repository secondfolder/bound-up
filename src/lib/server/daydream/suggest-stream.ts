/**
 * Reading the model provider's stream for a suggestion, for the suggest
 * endpoint (`api/daydreams/suggest`): how far along it is, for everyone's
 * progress line; each piece as it comes, for debug mode's live chat; and at
 * the end the answer, put back together in the shape the provider gives one
 * that was not streamed.
 *
 * That last is why the endpoint reads the stream rather than passing it on.
 * Everything downstream of an answer — the browser's checks
 * (`suggestions.ts`), debug mode's chat log (`exchange-log.ts`), and the
 * setup exchanges a daydream keeps sealed — reads that one shape, and those
 * kept before the stream was there are in it. And it is what lets the words
 * reach only an account holding debug mode until the answer is whole: anyone
 * else's page is told how many characters, not which.
 *
 * Two shapes of stream: Chat Completions (`data:` events of
 * `choices[0].delta`, ending `[DONE]`), and OpenRouter's Responses API, used
 * when a brief's links are read, whose events are typed. OpenRouter's own
 * documentation names some of those differently from OpenAI's
 * (`response.content_part.delta` for `response.output_text.delta`,
 * `response.done` for `response.completed`), so both are read. An item it
 * does not know, while the model is busy, is taken for a link being read,
 * since a fetch is the only tool it is given.
 *
 * Pure: it takes events and gives values, so it is tested without a network.
 */

import { reasoningIn } from '$lib/daydream/exchange-log';
import { type LiveDelta, type ModelProgress, WAITING } from '$lib/daydream/progress';
import type { SseEvent } from '$lib/daydream/sse';

export type StreamApi = 'chat/completions' | 'responses';

/** How the stream ended: the answer, whole, or what went wrong for debug mode's `detail`. */
export type StreamEnd = { ok: true; answer: unknown } | { ok: false; detail: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const json = (value: unknown) => JSON.stringify(value, null, 2) ?? String(value);

/** Output item types that are the model talking rather than a tool at work. */
const MODEL_ITEMS = new Set(['message', 'reasoning']);

export class SuggestStream {
	readonly #api: StreamApi;
	#progress: ModelProgress = { ...WAITING };

	// Chat Completions, gathered piece by piece.
	#content = '';
	// Null rather than empty or false: lint takes a primitive initialiser's
	// literal for a field's only value, and reports every later check of it
	// as always false.
	#reasoning: string | null = null;
	#finishReason: string | null = null;
	#usage: unknown = null;
	readonly #meta: Record<string, string> = {};
	/** Whether the stream said `[DONE]`. */
	#ended: 'done' | null = null;

	// The Responses API: the whole response at the end, and its items as they finished.
	#final: Record<string, unknown> | null = null;
	readonly #items: unknown[] = [];

	/** An error the provider reported partway through. */
	#error: unknown = null;

	constructor(api: StreamApi) {
		this.#api = api;
	}

	get progress(): ModelProgress {
		return this.#progress;
	}

	/** One event from the provider, and what debug mode's live chat is to be told of it. */
	read(event: SseEvent): LiveDelta[] {
		if (event.data === '[DONE]') {
			this.#ended = 'done';
			return [];
		}
		let data: unknown;
		try {
			data = JSON.parse(event.data);
		} catch {
			// Not an event this reader understands; the rest of the answer still is.
			return [];
		}
		if (!isObject(data)) {
			return [];
		}
		return this.#api === 'responses'
			? this.#readResponses(event.event, data)
			: this.#readChat(data);
	}

	/** The answer, once the stream has ended. */
	end(): StreamEnd {
		if (this.#error !== null) {
			return {
				ok: false,
				detail: `The model provider failed partway through:\n${json(this.#error)}`
			};
		}
		return this.#api === 'responses' ? this.#endResponses() : this.#endChat();
	}

	#advance(change: Partial<ModelProgress>) {
		this.#progress = { ...this.#progress, ...change };
	}

	// ── Chat Completions ───────────────────────────────────────────────────

	#readChat(data: Record<string, unknown>): LiveDelta[] {
		for (const key of ['id', 'model', 'provider'] as const) {
			if (typeof data[key] === 'string') {
				this.#meta[key] = data[key];
			}
		}
		if (data.usage !== undefined && data.usage !== null) {
			this.#usage = data.usage;
		}
		if (data.error !== undefined && data.error !== null) {
			this.#error = data.error;
			return [];
		}
		const choice = Array.isArray(data.choices) ? data.choices[0] : undefined;
		if (!isObject(choice)) {
			return [];
		}
		if (typeof choice.finish_reason === 'string') {
			this.#finishReason = choice.finish_reason;
		}
		if (!isObject(choice.delta)) {
			return [];
		}
		const deltas: LiveDelta[] = [];
		const thought = reasoningIn(choice.delta).text;
		if (thought) {
			this.#reasoning = (this.#reasoning ?? '') + thought;
			deltas.push({ kind: 'reasoning', text: thought });
			this.#advance({
				reasoningChars: this.#progress.reasoningChars + thought.length,
				...(this.#progress.stage === 'writing' ? {} : { stage: 'thinking' })
			});
		}
		const piece = choice.delta.content;
		if (typeof piece === 'string' && piece !== '') {
			this.#content += piece;
			deltas.push({ kind: 'text', text: piece });
			this.#advance({ stage: 'writing', chars: this.#progress.chars + piece.length });
		}
		return deltas;
	}

	#endChat(): StreamEnd {
		if (this.#ended === null && this.#finishReason === null) {
			return { ok: false, detail: 'The model’s stream ended before its answer did.' };
		}
		return {
			ok: true,
			answer: {
				...this.#meta,
				choices: [
					{
						message: {
							role: 'assistant',
							content: this.#content,
							...(this.#reasoning === null ? {} : { reasoning: this.#reasoning })
						},
						finish_reason: this.#finishReason
					}
				],
				...(this.#usage === null ? {} : { usage: this.#usage })
			}
		};
	}

	// ── the Responses API ──────────────────────────────────────────────────

	#readResponses(name: string | null, data: Record<string, unknown>): LiveDelta[] {
		const type = typeof data.type === 'string' ? data.type : (name ?? '');
		if (type === 'error' || type === 'response.error') {
			this.#error = data.error ?? data;
			return [];
		}
		if (
			type === 'response.completed' ||
			type === 'response.done' ||
			type === 'response.incomplete' ||
			type === 'response.failed'
		) {
			if (isObject(data.response)) {
				this.#final = data.response;
			}
			return [];
		}
		if (type.endsWith('.delta') && typeof data.delta === 'string' && data.delta !== '') {
			const piece = data.delta;
			if (type.includes('reasoning')) {
				this.#advance({
					reasoningChars: this.#progress.reasoningChars + piece.length,
					...(this.#progress.stage === 'writing' ? {} : { stage: 'thinking' })
				});
				return [{ kind: 'reasoning', text: piece }];
			}
			if (type.includes('output_text') || type.includes('content_part')) {
				this.#advance({ stage: 'writing', chars: this.#progress.chars + piece.length });
				return [{ kind: 'text', text: piece }];
			}
			return [];
		}
		const { item } = data;
		if (!isObject(item) || typeof item.type !== 'string' || MODEL_ITEMS.has(item.type)) {
			if (type === 'response.output_item.done' && isObject(item)) {
				this.#items.push(item);
			}
			return [];
		}
		if (type === 'response.output_item.added') {
			this.#advance({ stage: 'reading' });
			return [];
		}
		if (type === 'response.output_item.done') {
			this.#items.push(item);
			this.#advance({ pagesRead: this.#progress.pagesRead + 1 });
			return [
				{
					kind: 'fetch',
					url: typeof item.url === 'string' ? item.url : item.type,
					status: typeof item.status === 'string' ? item.status : 'done'
				}
			];
		}
		return [];
	}

	#endResponses(): StreamEnd {
		const final = this.#final;
		if (!final) {
			return { ok: false, detail: 'The model’s stream ended before its answer did.' };
		}
		if (final.status === 'failed') {
			return {
				ok: false,
				detail: `The model provider failed partway through:\n${json(final.error ?? final)}`
			};
		}
		// The final event should carry every item; where it does not, the
		// ones that finished along the way are the answer.
		const hasOutput = Array.isArray(final.output) && final.output.length > 0;
		return {
			ok: true,
			answer: hasOutput || this.#items.length === 0 ? final : { ...final, output: this.#items }
		};
	}
}
