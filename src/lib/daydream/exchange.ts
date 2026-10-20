/**
 * A daydream's exchange with the model: one request to the reply endpoint,
 * kept exactly as it went, for debug mode's raw log (docs/debug-mode.md,
 * "Daydreams' raw log"). The request body the server sent OpenRouter, as the
 * server stringified it, and the response's server-sent events, every byte
 * as they arrived. Nothing is parsed out of either when it is kept: what the
 * log shows is worked out from them when it is read (`exchange-log.ts`), so
 * a better reader shows more of every exchange already kept.
 *
 * Sealed as `daydream-exchange`, compressed, in a record of its own rather
 * than on the passage's turn, so the turn holds only the story and the log
 * loads only when it is open.
 *
 * Pure and alias-free: the sealed kind imports its caps.
 */

/** How the request ended, as the browser saw it. */
export type ExchangeEnding =
	/** The stream said it was done, or simply ended. */
	| 'done'
	/** The provider sent an error partway through. */
	| 'error'
	/** The user stopped it, or Stop the scene did. */
	| 'stopped'
	/** The connection dropped mid-reply. */
	| 'dropped';

export type Exchange = {
	/** OpenRouter's API the request went to. */
	endpoint: 'chat/completions';
	/** The request body exactly as the server sent it. */
	request: string;
	response: {
		/** The status the provider answered with, as the reply endpoint passed it on. */
		status: number;
		/** The stream exactly as it arrived from the provider, comments and all. */
		body: string;
		/** It ran past `EXCHANGE_LIMITS.response`, or the sealed record's cap, and only its start was kept. */
		truncated?: true;
	};
	ended: ExchangeEnding;
	/** When the request was sent and when its answer ended, in milliseconds since the epoch. */
	startedAt: number;
	endedAt: number;
};

/**
 * The most of each kept, in characters, before it is compressed. The request
 * is bounded by what the reply endpoint takes (a setup and a trimmed history,
 * with the system prompt round them), so its cap is only a backstop; the
 * response is a reply's events, a few hundred characters each.
 */
export const EXCHANGE_LIMITS = {
	request: 500_000,
	response: 3_000_000
} as const;

/** The most turns one read of exchanges asks about: each exchange can be most of a megabyte. */
export const MAX_READ_EXCHANGE_TURNS = 20;

/** The longest ciphertext kept for one, which D1's 2 MB per value has room for. */
export const MAX_EXCHANGE_CIPHERTEXT = 1024 * 1024;
