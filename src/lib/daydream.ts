/**
 * Daydreams, the pure half: the shape of a setup, the size limits every side
 * holds it to, and the words the screens use for the lead. See
 * docs/daydreams.md.
 *
 * Alias-free, like `types.ts`: the Drizzle schema imports `DaydreamTurnRole`
 * from here, and drizzle-kit loads the schema outside Vite.
 */

/** Who wrote a turn. The one thing about a turn the server can read. */
export type DaydreamTurnRole = 'user' | 'character';

/** Who leads the scene. Steers the character's voice; nothing else reads it. */
export type DaydreamLead = 'character' | 'me' | 'shared';

export const DAYDREAM_LEADS: readonly { value: DaydreamLead; label: string }[] = [
	{ value: 'character', label: 'They lead' },
	{ value: 'me', label: 'I lead' },
	{ value: 'shared', label: 'We take turns' }
];

/** What a daydream is set up with, as the setup form edits it and the model reads it. */
export type DaydreamSetup = {
	title: string;
	characterName: string;
	/** Who the character is and how they talk. */
	persona: string;
	lead: DaydreamLead;
	/** Where it starts and what is going on. */
	scenario: string;
	/** A few words: playful, strict, slow-burn. */
	tone: string;
	/** What must not happen, in the user's words. */
	limits: string;
	/** A word that stops the scene, as well as the default "red". */
	safeword: string;
};

/**
 * Lengths, in characters of visible text.
 *
 * Shared by the sealed kind, the setup form, the reply endpoint's checks and
 * the context trimming, so that what one side accepts the others do too. The
 * turn limit is generous because a character's reply is often several
 * paragraphs; the reply endpoint still caps how much of a conversation it
 * forwards (`MAX_CONTEXT_CHARS`), whatever a single turn may hold.
 */
export const DAYDREAM_LIMITS = {
	title: 80,
	characterName: 60,
	persona: 2000,
	scenario: 2000,
	tone: 200,
	limits: 1000,
	safeword: 40,
	turn: 8000
} as const;

/**
 * The most conversation one reply request may carry, in characters of turn
 * text. The browser trims to it (`daydream/context.ts`), keeping the newest
 * turns, and the server refuses anything over it. Roughly 15k tokens: enough
 * memory for a long scene, small enough that a reply stays cheap and fast.
 */
export const MAX_CONTEXT_CHARS = 60_000;

/** The most turns one reply request may carry, whatever their length. */
export const MAX_CONTEXT_TURNS = 200;

/** The safeword every daydream has, whatever else the setup names. */
export const DEFAULT_SAFEWORD = 'red';
