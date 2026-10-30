/**
 * Sampling settings for each step (docs/dreams.md, "Sampling"): more
 * variety where the model lists possibilities, steadier where it writes or
 * keeps records. One table, used by the routes and the bench alike, so a
 * bench run samples as the app does.
 *
 * `minP` is sent where it helps variety without losing the thread; providers
 * that do not support it ignore it. Its benefits are disputed, so the values
 * are for the bench to tune, not settled.
 *
 * `maxTokens` leaves room for a reasoning model to think first: on
 * OpenRouter its reasoning counts against the limit too, and at 1,200 one
 * model spent all of it thinking and wrote nothing.
 *
 * Alias-free, for the bench.
 */

export type Sampling = { temperature: number; minP?: number; maxTokens: number };

export const SAMPLING = {
	/** Step 1: listing directions, where the unlikely ones are wanted. */
	reading: { temperature: 1, minP: 0.05, maxTokens: 4000 },
	/** The build and its opening. */
	/**
	 * The build and its opening. Room for a model to think at length first:
	 * with research to work from, a build ran out of tokens at 9,000.
	 */
	build: { temperature: 0.9, minP: 0.05, maxTokens: 16_000 },
	passage: { temperature: 0.9, minP: 0.05, maxTokens: 6000 },
	/** Another take: a little hotter, so its words go somewhere new. */
	take: { temperature: 1, minP: 0.05, maxTokens: 6000 },
	/** Listing where the story could go next: as varied as step 1. */
	directions: { temperature: 1, minP: 0.05, maxTokens: 3000 },
	/** Keeping the elements: steady, since it is a record. */
	elements: { temperature: 0.6, maxTokens: 3000 },
	more: { temperature: 0.9, maxTokens: 3000 },
	summary: { temperature: 0.3, maxTokens: 3000 },
	/** Designing a block: a layout to a description, steady. */
	design: { temperature: 0.4, maxTokens: 3000 },
	/** The research step, for a story model without tools: a faithful record. */
	research: { temperature: 0.3, maxTokens: 4000 },
	/** The simulated player, which should act like different people. */
	player: { temperature: 1, maxTokens: 1500 }
} as const satisfies Record<string, Sampling>;

export type Step = keyof typeof SAMPLING;

export function isStep(name: string): name is Step {
	return Object.hasOwn(SAMPLING, name);
}
