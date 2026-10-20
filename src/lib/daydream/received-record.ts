/**
 * What a reply's stream carried besides its text, recorded for debug mode's
 * raw log (docs/debug-mode.md, "Daydreams' raw log"): the model's reasoning,
 * which model and provider answered, the generation's id, why it stopped and
 * what it cost in tokens. The suggestions' chat log (`suggest-chat-log.ts`)
 * shows the same for an answer that was not streamed.
 *
 * The stream is OpenRouter's server-sent events, passed through by the reply
 * endpoint untouched, so this reads them event by event as they arrive
 * (`ReplyReceipt.take`), and the passage seals what it gathered
 * (`ReplyReceipt.record`) beside `raw`. Kept through a Stop, like `raw`.
 *
 * Pure and alias-free: the sealed kind imports its caps.
 */

import { DAYDREAM_LIMITS } from '../daydream';

/** What a passage keeps, in `daydream-turn` v7's `received`. */
export type ReceivedRecord = {
	/** The model's reasoning, where the provider streamed it, as it arrived. */
	reasoning?: string;
	/** The reasoning ran past what was left of `rawReply`, and only its start was kept. */
	reasoningTruncated?: true;
	/** The model that answered, as OpenRouter named it: a fallback can differ from the one asked. */
	model?: string;
	/** The provider OpenRouter routed it to. */
	provider?: string;
	/** OpenRouter's id for the generation, to look it up by. */
	generationId?: string;
	/** Why it stopped: `stop`, `length` (out of tokens), and so on. */
	finishReason?: string;
	/** The token counts and cost, as JSON exactly as the provider gave them. */
	usage?: string;
};

/** The caps on `ReceivedRecord`'s short fields; the reasoning shares `rawReply` with `raw`. */
export const RECEIVED_LIMITS = {
	name: 200,
	finishReason: 64,
	usage: 2000
} as const;

/** Everything a stream carried besides its text, and a mid-reply error if one came. */
export type ReceivedLog = ReceivedRecord & {
	/** The error a stream ended on, as JSON. Never stored: a failed reply is not a turn. */
	error?: string;
};

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown, limit: number): string | undefined =>
	typeof value === 'string' && value !== '' ? value.slice(0, limit) : undefined;

/**
 * The reasoning in one chunk's delta. OpenRouter sends it as `reasoning`, and
 * the same again, in pieces with types, as `reasoning_details`; the details
 * are read only when there is no `reasoning`, so nothing is counted twice.
 * Encrypted details have no text to show.
 */
function reasoningIn(delta: Loose): string {
	if (typeof delta.reasoning === 'string') {
		return delta.reasoning;
	}
	if (!Array.isArray(delta.reasoning_details)) {
		return '';
	}
	return delta.reasoning_details
		.map((detail) => {
			if (!isObject(detail)) {
				return '';
			}
			if (detail.type === 'reasoning.text' && typeof detail.text === 'string') {
				return detail.text;
			}
			if (detail.type === 'reasoning.summary' && typeof detail.summary === 'string') {
				return detail.summary;
			}
			return '';
		})
		.join('');
}

/** Gathers a `ReceivedLog` from a reply's events, one at a time. */
export class ReplyReceipt {
	/** The reasoning, piece by piece as it arrived. */
	readonly #reasoning: string[] = [];
	readonly #log: ReceivedLog = {};

	/** One parsed event from the stream. Anything it does not recognise is passed over. */
	take(event: unknown): void {
		if (!isObject(event)) {
			return;
		}
		const model = text(event.model, RECEIVED_LIMITS.name);
		const provider = text(event.provider, RECEIVED_LIMITS.name);
		const id = text(event.id, RECEIVED_LIMITS.name);
		if (model) {
			this.#log.model = model;
		}
		if (provider) {
			this.#log.provider = provider;
		}
		if (id) {
			this.#log.generationId = id;
		}
		if (isObject(event.usage)) {
			const usage = JSON.stringify(event.usage, null, 2);
			// Too long to keep is too strange to cut: dropped rather than mangled.
			if (usage.length <= RECEIVED_LIMITS.usage) {
				this.#log.usage = usage;
			}
		}
		if (event.error !== undefined && event.error !== null) {
			this.#log.error = JSON.stringify(event.error, null, 2);
		}
		const choice = Array.isArray(event.choices) ? event.choices[0] : undefined;
		if (!isObject(choice)) {
			return;
		}
		const finish = text(choice.finish_reason, RECEIVED_LIMITS.finishReason);
		if (finish) {
			this.#log.finishReason = finish;
		}
		if (isObject(choice.delta)) {
			this.#reasoning.push(reasoningIn(choice.delta));
		}
	}

	/** Everything gathered so far, the error included, for a failed reply's log. */
	get log(): ReceivedLog {
		const reasoning = this.#reasoning.join('');
		return { ...this.#log, ...(reasoning ? { reasoning } : {}) };
	}

	/**
	 * What a passage keeps, or null for nothing worth keeping. The reasoning
	 * shares `DAYDREAM_LIMITS.rawReply` with the reply itself, `raw`, which
	 * is kept whole first: a reply is asked for at 1200 tokens, reasoning
	 * included, so the two together are a ceiling a runaway reply hits
	 * rather than one a normal one comes near, and the turn's ciphertext cap
	 * has no room for a second budget that size.
	 */
	record(raw: string): ReceivedRecord | null {
		const { error: _error, ...kept } = this.#log;
		const room = DAYDREAM_LIMITS.rawReply - Math.min(raw.length, DAYDREAM_LIMITS.rawReply);
		const whole = this.#reasoning.join('');
		const reasoning = whole.slice(0, room);
		const record: ReceivedRecord = {
			...kept,
			...(reasoning ? { reasoning } : {}),
			...(reasoning.length < whole.length ? { reasoningTruncated: true as const } : {})
		};
		return Object.keys(record).length > 0 ? record : null;
	}
}
