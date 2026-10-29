/**
 * Which providers serving a model allow adult content, and which to skip for
 * now because they started refusing (docs/server-settings.md, "Adult content
 * by provider").
 *
 * The rules are here, pure: classifying a reply, the back-off, and the order
 * requests are routed in. Running the checks and storing what they found is
 * `$lib/server/model-providers`. Alias-free, because the Drizzle schema
 * imports its types.
 */

export type ProviderKind = 'language' | 'voice';

/** The admin's say over a provider, whatever its checks found. */
export const OVERRIDES = ['auto', 'always', 'never'] as const;
export type ProviderOverride = (typeof OVERRIDES)[number];

/**
 * The adult levels a provider is checked at, mildest first. A provider's
 * level is the highest it passed. The daydream engine uses only providers
 * that passed the highest (`REQUIRED_LEVEL` in `dream/routing.ts`). No level
 * involves minors, or ever will.
 */
export const ADULT_LEVELS = [
	{ level: 1, label: 'Suggestive' },
	{ level: 2, label: 'Explicit' },
	{ level: 3, label: 'Explicit, with kink' },
	{ level: 4, label: 'Consent-play fantasy' }
] as const;
export type AdultLevel = 0 | 1 | 2 | 3 | 4;

export type ReplyOutcome = 'complied' | 'refused' | 'filtered' | 'error';

const REFUSAL =
	/^\W*(?:i(?:'|’)?m sorry|i am sorry|sorry,|i can(?:'|’)?t|i cannot|i(?:'|’)?m not able|i am not able|i(?:'|’)?m unable|i am unable|i won(?:'|’)?t|i will not|as an ai|i must decline|i(?:'|’)?m not comfortable)/i;
/** Shorter than this, a reply to a request for a passage was cut off or emptied. */
const MIN_REPLY_CHARS = 40;

/**
 * What a reply to an adult request was: written, refused in words, filtered
 * (stopped by moderation, or emptied), or an error. Cheap signals only; a
 * judge call is for the cases these cannot tell.
 */
export function classifyReply(text: string, finishReason: string | null): ReplyOutcome {
	if (finishReason === 'content_filter') {
		return 'filtered';
	}
	const trimmed = text.trim();
	if (REFUSAL.test(trimmed.slice(0, 200))) {
		return 'refused';
	}
	return trimmed.length < MIN_REPLY_CHARS ? 'filtered' : 'complied';
}

const MINUTE = 60_000;

/**
 * How long a provider is skipped after each refusal in a row: it grows, and
 * stops at a day. Plain errors have their own, shorter one, so a busy
 * provider is not mistaken for a prudish one.
 */
export const REFUSAL_BACKOFF_MS = [10, 30, 90, 270, 810, 1440].map((minutes) => minutes * MINUTE);
export const ERROR_BACKOFF_MS = [1, 2, 5, 15].map((minutes) => minutes * MINUTE);
/** Successes in a row that clear a provider's refusals. */
export const SUCCESSES_TO_RESET = 3;

export type ProviderHealth = {
	refusalsInRow: number;
	errorsInRow: number;
	successesInRow: number;
	refusalBackoffUntil: Date | null;
	errorBackoffUntil: Date | null;
	/** The last rejection's kind and code, never anything of the story. */
	lastReason: string | null;
};

export const HEALTHY: ProviderHealth = {
	refusalsInRow: 0,
	errorsInRow: 0,
	successesInRow: 0,
	refusalBackoffUntil: null,
	errorBackoffUntil: null,
	lastReason: null
};

function step(schedule: readonly number[], count: number): number {
	return schedule[Math.min(count, schedule.length) - 1] ?? 0;
}

/** A provider's health after one more reply. */
export function nextHealth(
	health: ProviderHealth,
	outcome: ReplyOutcome,
	now: Date,
	reason: string | null = null
): ProviderHealth {
	if (outcome === 'complied') {
		const successesInRow = health.successesInRow + 1;
		const reset = successesInRow >= SUCCESSES_TO_RESET;
		return {
			...health,
			errorsInRow: 0,
			errorBackoffUntil: null,
			successesInRow,
			refusalsInRow: reset ? 0 : health.refusalsInRow,
			refusalBackoffUntil: reset ? null : health.refusalBackoffUntil
		};
	}
	if (outcome === 'error') {
		const errorsInRow = health.errorsInRow + 1;
		return {
			...health,
			successesInRow: 0,
			errorsInRow,
			errorBackoffUntil: new Date(now.getTime() + step(ERROR_BACKOFF_MS, errorsInRow)),
			lastReason: reason ?? 'error'
		};
	}
	const refusalsInRow = health.refusalsInRow + 1;
	return {
		...health,
		successesInRow: 0,
		refusalsInRow,
		refusalBackoffUntil: new Date(now.getTime() + step(REFUSAL_BACKOFF_MS, refusalsInRow)),
		lastReason: reason ?? outcome
	};
}

/** When a provider is next usable, or null if it is usable now. */
export function backoffUntil(health: ProviderHealth, now: Date): Date | null {
	const until = [health.refusalBackoffUntil, health.errorBackoffUntil]
		.filter((date): date is Date => date !== null && date > now)
		.sort((a, b) => b.getTime() - a.getTime());
	return until[0] ?? null;
}

export type ProviderState = {
	/** OpenRouter's endpoint tag, e.g. "deepinfra/fp4", which routing accepts. */
	provider: string;
	/** The highest adult level it passed; null when never checked. */
	levelPassed: AdultLevel | null;
	checkedAt: Date | null;
	override: ProviderOverride;
	health: ProviderHealth;
	/** Cheapest first, as OpenRouter lists them; the tie-break in routing. */
	order: number;
};

/**
 * The providers to route a request to, in order, for content at this level:
 * those that passed it (or that the admin always allows), minus any backing
 * off, never the ones the admin ruled out.
 */
export function eligibleProviders(
	states: readonly ProviderState[],
	level: AdultLevel,
	now: Date
): string[] {
	return states
		.filter((state) => state.override !== 'never')
		.filter((state) => state.override === 'always' || (state.levelPassed ?? 0) >= level)
		.filter((state) => backoffUntil(state.health, now) === null)
		.sort((a, b) => a.order - b.order)
		.map((state) => state.provider);
}
