/**
 * Who speaks in which voice (docs/dreams.md, "Read aloud"). The narrator has
 * the server's narrator voice; each character is matched by code to one of
 * the curated voices (`FISH_VOICE_PRESETS`) from how the build described
 * them: their `voice` field first, then their manner and appearance. Among
 * the close matches one is chosen by the daydream and the character, so a
 * character keeps their voice from passage to passage, and the same
 * description need not get the same voice in every daydream.
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

/** The voice a line is read in: the narrator's, or its speaker's. */
export function voiceForSpeaker(
	who: string | null,
	elements: readonly DreamElement[],
	dreamId: string,
	narrator: FishVoicePresetId | null
): VoiceName {
	if (who === null || who === 'you') {
		return 'narrator';
	}
	const element = elements.find((entry) => entry.id === who);
	return element ? voiceFor(element, dreamId, narrator) : 'narrator';
}
