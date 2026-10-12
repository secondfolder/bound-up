import { z } from 'zod';

/**
 * How one run of the IQ test is set up: who is taking it, how it is dressed,
 * and the two optional numbers the results compare against.
 *
 * Alias-free: the Drizzle schema imports these types for the stored result's
 * columns, and drizzle-kit loads the schema outside Vite.
 */

/**
 * Who is sitting the test. This is the whole of the rigging's input: a sub is
 * given harder questions and marked against a harsher norm, a dom easier ones
 * against a kinder norm. See `scoring.ts`.
 */
export const ROLES = ['dom', 'sub'] as const;
export type Role = (typeof ROLES)[number];

/**
 * How intense the test is: the setup's slider, a level from 0 to 4. Stored as
 * the number, so levels compare with `>=` rather than through a lookup; what
 * each is called is in `copy.ts`.
 *
 * A level offers options rather than imposing a fixed look: each level adds
 * toggles (see `Settings`), which all start on. What a run actually does is
 * asked of the helpers below, never read off the level directly.
 *
 * - 0 is official from start to finish, with nothing to choose.
 * - 1 adds a humiliating analysis of the results.
 * - 2 adds a vibe: its look, and its questions.
 * - 3 adds porn around the questions, and the hypno for every vibe (bambi
 *   has it from 2).
 * - 4 adds subliminal flashes, over a porn background, and packs the porn
 *   tighter.
 */
export const INTENSITIES = [0, 1, 2, 3, 4] as const;
export type Intensity = (typeof INTENSITIES)[number];
export const MAX_INTENSITY: Intensity = 4;

/**
 * The flavour every run from level 2 up is written in. The first is the
 * one the setup dialog starts on.
 */
export const VIBES = [
	'gooner',
	'bambi',
	'misogyny',
	'denial',
	'feminisation',
	'degradation'
] as const;
export type Vibe = (typeof VIBES)[number];

/** Bounds for the optional sober and target IQs. Wider than any score the test gives. */
export const IQ_INPUT_MIN = 40;
export const IQ_INPUT_MAX = 200;

const iqInput = z.number().int().min(IQ_INPUT_MIN).max(IQ_INPUT_MAX).nullable();

export const settingsSchema = z
	.object({
		role: z.enum(ROLES),
		intensity: z.literal(INTENSITIES),
		vibe: z.enum(VIBES).nullable(),
		/** The taker's real IQ, if they want it beside the result. */
		soberIq: iqInput,
		/**
		 * The score they are hoping for. Compared against in the results only:
		 * it never steers the rigging, so hitting it means something.
		 */
		targetIq: iqInput,
		/**
		 * The toggles each level offers, all on unless turned off, and each
		 * counted only at a level that offers it. Defaults, so settings
		 * remembered before a toggle existed still parse.
		 */
		/** From 1: a humiliating analysis of the results, if the score earns one. */
		humiliating: z.boolean().default(true),
		/** From 2: the vibe's colours, fonts, title and intro. */
		themedLook: z.boolean().default(true),
		/** From 2: the vibe's words in the questions, the teasing and the banners. */
		themedQuestions: z.boolean().default(true),
		/** From 3: porn around the questions. */
		porn: z.boolean().default(true),
		/** From 2 for bambi, 3 for the rest: a hypno playing alongside. */
		hypno: z.boolean().default(true),
		/** At 4: pictures and taunts flashed over the page. */
		subliminals: z.boolean().default(true)
	})
	.refine((settings) => settings.intensity < VIBE_LEVEL || settings.vibe !== null, {
		message: 'Choose a vibe',
		path: ['vibe']
	});

export type Settings = z.output<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
	role: 'sub',
	intensity: 0,
	vibe: null,
	soberIq: null,
	targetIq: null,
	humiliating: true,
	themedLook: true,
	themedQuestions: true,
	porn: true,
	hypno: true,
	subliminals: true
};

/** The toggles, by name: what a level's options switch. */
export type Toggle =
	| 'humiliating'
	| 'themedLook'
	| 'themedQuestions'
	| 'porn'
	| 'hypno'
	| 'subliminals';

/** The level from which a vibe is chosen, and so the run is themed at all. */
export const VIBE_LEVEL = 2;

/** Enough of a run's settings to say what it does: a stored result has no toggles but two. */
export type SettingsLike = Pick<Settings, 'intensity' | 'vibe'> & Partial<Pick<Settings, Toggle>>;

/**
 * The level each toggle is offered from, in the order the settings show
 * them: the one table both the helpers below and `togglesAt` read, so what
 * a level offers and what a run does cannot drift apart. The hypno's depends
 * on the vibe: bambi's is audio, and comes in with the vibe at 2; every
 * other vibe's is a video, among the porn at 3.
 */
const TOGGLE_LEVELS: readonly (readonly [Toggle, (vibe: Vibe | null) => number])[] = [
	['humiliating', () => 1],
	['themedLook', () => VIBE_LEVEL],
	['themedQuestions', () => VIBE_LEVEL],
	['hypno', (vibe) => (vibe === 'bambi' ? VIBE_LEVEL : 3)],
	['porn', () => 3],
	['subliminals', () => 4]
];

/** The level a toggle is offered from, for a vibe. */
export function toggleLevel(toggle: Toggle, vibe: Vibe | null): number {
	const entry = TOGGLE_LEVELS.find(([name]) => name === toggle);
	return entry ? entry[1](vibe) : Number.POSITIVE_INFINITY;
}

/** A toggle counts when the level offers it and it is on (absent counts as on). */
function on(settings: SettingsLike, toggle: Toggle): boolean {
	return settings.intensity >= toggleLevel(toggle, settings.vibe) && settings[toggle] !== false;
}

/**
 * The vibe a run is actually written in: none below level 2, even when one
 * was picked earlier and is still in the remembered settings. The dialog
 * keeps the choice so going back up restores it, but a run below the vibe's
 * level must not leak a word of it.
 */
export function effectiveVibe(settings: Pick<Settings, 'intensity' | 'vibe'>): Vibe | null {
	return settings.intensity >= VIBE_LEVEL ? settings.vibe : null;
}

/** The level from which the sober and target IQs are asked for and compared against. */
export const IQ_LEVEL = 1;

/**
 * The sober and target IQs a run actually compares against: none at level
 * 0, which asks for neither, even when some were typed at a higher level and
 * are still in the settings — kept, like the vibe, so going back up finds
 * them.
 */
export function effectiveIqs(
	settings: Pick<Settings, 'intensity' | 'soberIq' | 'targetIq'>
): Pick<Settings, 'soberIq' | 'targetIq'> {
	return settings.intensity >= IQ_LEVEL
		? { soberIq: settings.soberIq, targetIq: settings.targetIq }
		: { soberIq: null, targetIq: null };
}

/**
 * Whether the results humiliate: openly a kink test — mocking or flattering
 * copy — in the vibe's words from level 2, in plain ones at level 1. Even
 * then the run never admits that the test is rigged: saying so broke the
 * spell for the people it was meant to please.
 */
export function humiliates(settings: SettingsLike): boolean {
	return on(settings, 'humiliating');
}

/** Whether the page wears the vibe: its colours, fonts, title and intro. */
export function looksThemed(settings: SettingsLike): boolean {
	return on(settings, 'themedLook') && effectiveVibe(settings) !== null;
}

/** Whether the questions, the teasing and the banners are in the vibe's words. */
export function themesQuestions(settings: SettingsLike): boolean {
	return on(settings, 'themedQuestions') && effectiveVibe(settings) !== null;
}

/** Whether porn is shown around the questions, and so the media feed fetched. */
export function showsPorn(settings: SettingsLike): boolean {
	return on(settings, 'porn') && effectiveVibe(settings) !== null;
}

/** Whether pictures and taunts are flashed over the page. */
export function flashes(settings: SettingsLike): boolean {
	return on(settings, 'subliminals') && effectiveVibe(settings) !== null;
}

/**
 * Whether a porn video plays as the page's background: at level 4, whenever
 * there is porn. Not a subliminal, so turning those off leaves it.
 */
export function playsBackdrop(settings: SettingsLike): boolean {
	return settings.intensity >= 4 && showsPorn(settings);
}

/** Whether a hypno plays alongside the test. */
export function playsHypno(settings: SettingsLike): boolean {
	const vibe = effectiveVibe(settings);
	return vibe !== null && on({ ...settings, vibe }, 'hypno');
}

/** Which toggles a level offers, in the order they are shown, for a vibe. */
export function togglesAt(level: Intensity, vibe: Vibe | null): Toggle[] {
	return TOGGLE_LEVELS.filter(([, from]) => level >= from(vibe)).map(([toggle]) => toggle);
}
