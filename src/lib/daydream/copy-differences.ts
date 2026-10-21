/**
 * Where a daydream's copy of an idea or character differs from the
 * library's, field by field (docs/daydreams.md, "Characters and ideas, and
 * the library"). A copy goes its own way in a story — the story raises the
 * idea's heat, "Update the idea" rewrites its premise, a character grows
 * eager — and its revision says nothing of that, since it only records
 * which library version it was copied from. So the setup page compares the
 * fields themselves, and each difference can go either way: kept here and
 * copied to the library, or the library's taken here.
 *
 * Pure and alias-free.
 */

import {
	CHARACTER_TEXT_FIELDS,
	type CharacterDials,
	type DaydreamNarrator,
	type DialValue,
	IDEA_TEXT_FIELDS,
	type IdeaDials
} from '../daydream';
import { CHARACTER_FIELD_LABELS, ideaFieldLabels } from './catalog';
import { CHARACTER_SLIDERS, CHARACTER_TONES, IDEA_SLIDERS } from './dial-words';

/** One field that differs: what it is called, and each side's value as shown. */
export type Difference<Key extends string> = {
	key: Key;
	label: string;
	here: string;
	library: string;
};

type Idea = Record<'title' | (typeof IDEA_TEXT_FIELDS)[number], string> & { dials: IdeaDials };
type Character = Record<'name' | (typeof CHARACTER_TEXT_FIELDS)[number], string> & {
	dials: CharacterDials;
};

export const IDEA_COMPARED = ['title', ...IDEA_TEXT_FIELDS, 'heat', 'kink'] as const;
export type IdeaKey = (typeof IDEA_COMPARED)[number];

export const CHARACTER_COMPARED = [
	'name',
	...CHARACTER_TEXT_FIELDS,
	'tone',
	...CHARACTER_SLIDERS.map((slider) => slider.key)
] as const;
export type CharacterKey = (typeof CHARACTER_COMPARED)[number];

const text = (value: string) => value.trim() || '(empty)';

function scaleLabel(
	sliders: readonly { key: string; scale: Record<DialValue, { label: string }> }[],
	key: string,
	value: DialValue | null
): string {
	return value === null
		? 'Not set'
		: (sliders.find((slider) => slider.key === key)?.scale[value].label ?? String(value));
}

function ideaValue(idea: Idea, key: IdeaKey): string | DialValue | null {
	return key === 'heat' || key === 'kink' ? idea.dials[key] : idea[key];
}

/** The idea's fields that differ between this daydream's copy and the library's. */
export function ideaDifferences(
	here: Idea,
	library: Idea,
	narrator?: DaydreamNarrator
): Difference<IdeaKey>[] {
	const labels = ideaFieldLabels(narrator);
	return IDEA_COMPARED.flatMap((key): Difference<IdeaKey>[] => {
		const mine = ideaValue(here, key);
		const theirs = ideaValue(library, key);
		if (
			(typeof mine === 'string' ? mine.trim() : mine) ===
			(typeof theirs === 'string' ? theirs.trim() : theirs)
		) {
			return [];
		}
		if (key === 'heat' || key === 'kink') {
			return [
				{
					key,
					label: key === 'heat' ? 'Heat' : 'Kink',
					here: scaleLabel(IDEA_SLIDERS, key, here.dials[key]),
					library: scaleLabel(IDEA_SLIDERS, key, library.dials[key])
				}
			];
		}
		return [
			{
				key,
				label: key === 'title' ? 'Title' : labels[key].label,
				here: text(here[key]),
				library: text(library[key])
			}
		];
	});
}

/** `target` with one of the idea's fields taken from `source`. */
export function takeIdeaField<T extends Idea>(target: T, source: Idea, key: IdeaKey): T {
	if (key === 'heat' || key === 'kink') {
		return { ...target, dials: { ...target.dials, [key]: source.dials[key] } };
	}
	return { ...target, [key]: source[key] };
}

function characterValue(character: Character, key: CharacterKey): string | DialValue | null {
	return key === 'name' || (CHARACTER_TEXT_FIELDS as readonly string[]).includes(key)
		? character[key as keyof Omit<Character, 'dials'>]
		: character.dials[key as keyof CharacterDials];
}

function characterShown(character: Character, key: CharacterKey): string {
	if (key === 'tone') {
		return CHARACTER_TONES.find((tone) => tone.value === character.dials.tone)?.label ?? 'Not set';
	}
	if (key === 'name' || (CHARACTER_TEXT_FIELDS as readonly string[]).includes(key)) {
		return text(character[key as keyof Omit<Character, 'dials'>]);
	}
	return scaleLabel(
		CHARACTER_SLIDERS,
		key,
		character.dials[key as Exclude<keyof CharacterDials, 'tone'>]
	);
}

function characterLabel(key: CharacterKey): string {
	if (key === 'name') {
		return 'Name';
	}
	if (key === 'tone') {
		return 'Tone';
	}
	const field = CHARACTER_FIELD_LABELS[key as (typeof CHARACTER_TEXT_FIELDS)[number]];
	return field?.label ?? CHARACTER_SLIDERS.find((slider) => slider.key === key)?.label ?? key;
}

/** A character's fields and dials that differ between this daydream's copy and the library's. */
export function characterDifferences(
	here: Character,
	library: Character
): Difference<CharacterKey>[] {
	return CHARACTER_COMPARED.flatMap((key): Difference<CharacterKey>[] => {
		const mine = characterValue(here, key);
		const theirs = characterValue(library, key);
		if (
			(typeof mine === 'string' ? mine.trim() : mine) ===
			(typeof theirs === 'string' ? theirs.trim() : theirs)
		) {
			return [];
		}
		return [
			{
				key,
				label: characterLabel(key),
				here: characterShown(here, key),
				library: characterShown(library, key)
			}
		];
	});
}

/** `target` with one of a character's fields or dials taken from `source`. */
export function takeCharacterField<T extends Character>(
	target: T,
	source: Character,
	key: CharacterKey
): T {
	if (key === 'name' || (CHARACTER_TEXT_FIELDS as readonly string[]).includes(key)) {
		const field = key as keyof Omit<Character, 'dials'>;
		return { ...target, [field]: source[field] };
	}
	const dial = key as keyof CharacterDials;
	return { ...target, dials: { ...target.dials, [dial]: source.dials[dial] } };
}
