/**
 * Writing styles (docs/dreams.md, "Writing styles"): how a daydream's prose
 * reads, apart from what happens in it. Left to itself a model writes the
 * same ornate prose for everything, so the build chooses one of these
 * presets for the brief's tone, or describes a style of its own when none
 * fits, and the story can change it as it goes. The user can choose another
 * on the setup page.
 *
 * Each preset is a short set of instructions, worded as concretely as the
 * craft advice it comes from: concrete nouns and strong verbs, named failure
 * modes, telling allowed where it moves things on. `filthy` is the user's own
 * prompt for explicit roleplay, with everything but its style and tone taken
 * out.
 *
 * Pure and alias-free.
 */

import { z } from 'zod';

export type StylePreset = {
	id: string;
	/** What the setup page calls it. */
	name: string;
	/** A line for the setup page's choice. */
	summary: string;
	/** For the build and the story: what kind of daydream it suits. */
	suits: string;
	/** The instructions every passage is written by. */
	prompt: string;
};

export const STYLE_PRESETS = [
	{
		id: 'plain',
		name: 'Plain and close',
		summary: 'Clear, concrete and unfussy: what happens, up close.',
		suits: 'almost anything; the choice when nothing calls for another',
		prompt:
			'Write plainly and closely. Concrete nouns and strong verbs; an adjective only where it tells the reader something they would not assume. Describe what is there to be seen, heard and felt, not what it is like: a simile or metaphor at most once in a passage, and only a fresh one. No atmosphere for its own sake: a sentence about the setting is there because someone is acting in it. Vary sentence length, mostly short to middling. Let dialogue carry a scene where people are talking. Telling is fine for getting quickly from one moment to the next; show the moments that matter.'
	},
	{
		id: 'filthy',
		name: 'Raw and filthy',
		summary: 'Crude, explicit and hot, like sexting with someone really into it.',
		suits: 'explicit daydreams about the sex itself, and crude or degrading dynamics',
		prompt: `Write like two people sexting who are really into each other: raw, playful, dripping with want. Keep the focus on bodies and what they are doing; skip scene-setting that is only there for atmosphere, and get back to the sex.
- Crude words, never clinical ones or euphemisms: cock, dick, pussy, cunt, tits, ass, nipples, cum, fucking, throbbing, leaking; not penis, vulva, breasts, cleavage, glutes, semen, areola. A clinical word only where the scene itself is clinical.
- Concrete physical detail over metaphor and simile: say what a stretch, a weight or a wetness actually feels like, not what it is like.
- Vivid, specific bodies, tailored to this scene and these people: skin flushed, hot, slick or goosebumped; how tits, an ass or a cock look, move and sway; lips, piercings, veins, hair, colour and shape, whatever is really there and in play.
- Moans, gasps and dirty talk in the characters' own voices, written as they sound. The wet sound of a deepthroat is "gluck".
- Where the scene is degrading, humiliating or crude, the language is cruder still.
- Tight: a couple of short paragraphs, unless the telling notes say otherwise. Not every passage has to escalate, but none ends flat.`
	},
	{
		id: 'lush',
		name: 'Lush and slow',
		summary: 'Rich, sensual and unhurried; it lingers.',
		suits: 'slow burns, romance and sensual daydreams where the anticipation is the point',
		prompt: `Write richly and unhurriedly. Linger on sensation: texture, temperature, scent, sound, the small shifts of a body or a voice. Longer, rhythmic sentences are welcome, broken by a short one when something lands. Imagery is allowed but earned and specific: one fresh image beats three familiar ones, and nothing read a thousand times before (no shivers down spines, no electricity at a touch, no breath they didn't know they were holding). Feeling is part of the scene. Slow down in the moments that matter and move quickly through the rest.`
	},
	{
		id: 'clipped',
		name: 'Cold and clipped',
		summary: 'Short, controlled sentences; restraint does the work.',
		suits:
			'strict or cold dominance, clinical or procedural settings, institutions, tension held under the surface',
		prompt:
			'Write tersely. Short declarative sentences, and fragments where they land harder. No adverbs of feeling, few adjectives, almost no imagery: state precisely what is done and said, and let the reader feel it. Dialogue is brief and exact. Emotion shows only in what people do, and fail to do. White space is part of the rhythm: one line can be a paragraph.'
	},
	{
		id: 'playful',
		name: 'Light and teasing',
		summary: 'Warm, funny and flirtatious; banter carries it.',
		suits: 'flirtation, romantic comedy, bratty or playful dynamics, anything meant to be fun',
		prompt:
			'Write lightly, with a grin. Banter and quick back-and-forth carry the scene; let people be funny on purpose, tease, misread each other and recover. Keep the narration brisk and conversational, with the odd wry aside. Heat comes from the teasing as much as the touching, so let it build through what people say. Nothing ponderous, and nothing solemn unless a moment turns serious, and then let it.'
	},
	{
		id: 'pulp',
		name: 'Pulpy and breathless',
		summary: 'Fast, punchy genre fiction: momentum and hooks.',
		suits: 'adventure, thrillers, heists, sci-fi or fantasy romps, anything driven by plot',
		prompt:
			'Write like a good page-turner. Momentum first: open in the middle of something, keep things happening, and end each passage on a hook. Punchy verbs, quick vivid description, a confident narrator unafraid of a little melodrama. Enjoy the genre: lean into its trappings and pleasures rather than apologising for them. Cut anything that slows the story without raising the stakes.'
	},
	{
		id: 'dark',
		name: 'Dark and heavy',
		summary: 'Menacing and oppressive; dread over shock.',
		suits: 'horror, noir, dark fantasy, captivity and menace, anything meant to unsettle',
		prompt: `Write with weight and menace. Atmosphere matters here, but it is pointed: a detail of a place is there because it presses on someone. Dread over shock: what is withheld, the sound in the next room, the thing nobody says. Measured, deliberate sentences, and precise, unsettling detail rather than words that announce how frightening something is (not "eerie", "ominous" or "sinister"). Let silences sit.`
	}
] as const satisfies readonly StylePreset[];

export type StyleId = (typeof STYLE_PRESETS)[number]['id'];

/** A style the model described itself, because no preset fit. */
export const OWN_STYLE = 'own';

export const DEFAULT_STYLE: StyleId = 'plain';

const STYLE_IDS: readonly string[] = STYLE_PRESETS.map((preset) => preset.id);

export function isPreset(id: string): id is StyleId {
	return STYLE_IDS.includes(id);
}

/** Notes are sent with every passage, so they are kept short. */
export const MAX_STYLE_NOTES_CHARS = 800;

export const writingStyleSchema = z.object({
	/** A preset's id, or `own` for a style described entirely in `notes`. */
	preset: z.enum([OWN_STYLE, ...STYLE_PRESETS.map((preset) => preset.id)]),
	/** Adjustments to the preset for this daydream, or the whole of an own style. */
	notes: z.string().max(MAX_STYLE_NOTES_CHARS),
	/** Who chose it: a style the user chose is changed only when they ask. */
	by: z.enum(['model', 'user'])
});

export type WritingStyle = z.output<typeof writingStyleSchema>;

export function presetOf(id: string): StylePreset | undefined {
	return STYLE_PRESETS.find((preset) => preset.id === id);
}

/**
 * A style as the model wrote it, as `<style preset="…">notes</style>` or a
 * footer line: an unknown preset with notes is a style of its own, and one
 * with neither is the default.
 */
export function readStyle(
	preset: string | undefined,
	notes: string,
	by: WritingStyle['by'] = 'model'
): WritingStyle {
	const id = preset?.trim().toLowerCase() ?? '';
	const trimmed = notes.trim().slice(0, MAX_STYLE_NOTES_CHARS);
	if (isPreset(id)) {
		return { preset: id, notes: trimmed, by };
	}
	return trimmed
		? { preset: OWN_STYLE, notes: trimmed, by }
		: { preset: DEFAULT_STYLE, notes: '', by };
}

/**
 * The style a rebuild ends with. One the user chose stays theirs while the
 * build keeps its preset, notes and all: a model rewriting the build tends
 * to reword what it was handed. A different preset is the build following a
 * change the user asked for.
 */
export function keptStyle(previous: WritingStyle | undefined, built: WritingStyle): WritingStyle {
	return previous?.by === 'user' && previous.preset === built.preset ? previous : built;
}

/** What the user sees a style called. */
export function styleName(style: WritingStyle): string {
	return presetOf(style.preset)?.name ?? 'Its own style';
}

export function sameStyle(a: WritingStyle | undefined, b: WritingStyle | undefined): boolean {
	return a?.preset === b?.preset && (a?.notes ?? '') === (b?.notes ?? '');
}

/** The style's instructions, for every passage (`<writing-style>` in the prompt). */
export function styleInstructions(style: WritingStyle): string {
	const preset = presetOf(style.preset);
	const parts = preset ? [preset.prompt] : [];
	if (style.notes) {
		parts.push(preset ? `For this daydream: ${style.notes}` : style.notes);
	}
	if (style.by === 'user') {
		parts.push('The user chose this style.');
	}
	return parts.join('\n');
}

/**
 * The presets listed for the model to choose from, one a line, or with
 * their instructions in `full`, for the build, which writes the opening in
 * the one it chooses.
 */
export function presetList(options: { full?: boolean } = {}): string {
	return STYLE_PRESETS.map((preset) => {
		const line = `- ${preset.id} (${preset.name}): suits ${preset.suits}`;
		return options.full ? `${line}\n${wrapPrompt(preset.prompt)}` : line;
	}).join('\n');
}

function wrapPrompt(prompt: string): string {
	return prompt
		.split('\n')
		.map((line) => `    ${line}`)
		.join('\n');
}
