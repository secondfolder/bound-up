/**
 * Who speaks in which voice (docs/dreams.md, "Voices"). The narrator has the
 * server's narrator voice unless the user chose another of the curated
 * voices (`FISH_VOICE_PRESETS`) for this daydream, and every character
 * speaks in the narrator's voice unless the user chose one for them. A
 * voice to suit a character is still worked out (`voiceFor`), from how the
 * build described them, but only as a suggestion beside the choice: a
 * voice of code's choosing for every character sounded like a cast the
 * user had not asked for.
 *
 * Pure and alias-free.
 */

import { FISH_VOICE_PRESETS, type FishVoicePresetId } from '../server-settings';
import type { DreamElement } from './elements';
import { genderOf } from './gender';

/** What a voice request names: the narrator, or one of the curated voices. */
export type VoiceName = 'narrator' | FishVoicePresetId;

const GENDERS = { feminine: 'female', masculine: 'male' } as const;
const OLDER = /\b(?:older|old|middle-aged|mature|forties|fifties|sixties|grey|gray|silver|aged)\b/i;
const WORD = /[\p{L}-]+/gu;

/** How a character is described, most telling first. */
function description(element: DreamElement): string {
	const field = (name: string) =>
		element.fields.find((entry) => entry.name === name)?.text.trim() ?? '';
	return [field('voice'), field('manner'), field('appearance'), field('pronouns')]
		.filter(Boolean)
		.join('. ');
}

/** A stable number for a string, to choose among equal matches. */
function hash(text: string): number {
	let value = 2_166_136_261;
	for (const char of text) {
		value ^= char.codePointAt(0) ?? 0;
		value = Math.imul(value, 16_777_619);
	}
	return value >>> 0;
}

/**
 * The curated voice for a character in a daydream. A voice of the other
 * gender is never chosen when the description says one; the narrator's own
 * voice is left out while there are others, so a character does not sound
 * like the narration around them.
 */
export function voiceFor(
	element: DreamElement,
	dreamId: string,
	narrator: FishVoicePresetId | null
): FishVoicePresetId {
	const text = description(element);
	const gender = genderOf(text);
	const wanted = gender === null ? null : GENDERS[gender];
	const older = OLDER.test(text);
	const words = new Set((text.toLowerCase().match(WORD) ?? []).map((word) => word.trim()));
	const candidates = FISH_VOICE_PRESETS.filter(
		(preset) => wanted === null || preset.gender === wanted
	);
	const others = candidates.filter((preset) => preset.id !== narrator);
	const pool = others.length > 0 ? others : candidates;
	const scored = pool.map((preset) => ({
		id: preset.id,
		score:
			preset.tags.filter((tag) => words.has(tag)).length +
			(older === (preset.age !== 'young') ? 1 : 0)
	}));
	const best = Math.max(...scored.map((entry) => entry.score));
	// Close matches: the best, and anything one short of it.
	const close = scored.filter((entry) => entry.score >= best - 1);
	const picked = close[hash(`${dreamId}:${element.id}`) % close.length];
	return picked?.id ?? FISH_VOICE_PRESETS[0].id;
}

/** The voices the user chose for a daydream: absent is the default. */
export type ChosenVoices = {
	narrator?: FishVoicePresetId | undefined;
	characters?: Readonly<Record<string, FishVoicePresetId>> | undefined;
};

/** The narrator's voice: the one chosen, or the server's own. */
export function narratorVoice(chosen: ChosenVoices | undefined): VoiceName {
	return chosen?.narrator ?? 'narrator';
}

/**
 * The voice a line is read in: its speaker's, if one was chosen for them,
 * else the narrator's. The user's own lines are the narrator's.
 */
export function voiceForSpeaker(who: string | null, chosen: ChosenVoices | undefined): VoiceName {
	const own = who === null || who === 'you' ? undefined : chosen?.characters?.[who];
	return own ?? narratorVoice(chosen);
}
