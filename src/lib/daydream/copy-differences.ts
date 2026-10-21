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
 * The core fields and dials are compared by name; the rest (`DaydreamField`)
 * by id, so one added, removed, renamed or rewritten on either side shows up
 * as a difference of its own. A spoiler's value is never shown here, as it is
 * nowhere else: only that it differs.
 *
 * Pure and alias-free.
 */

import type {
	CharacterDials,
	CharacterFieldKind,
	DaydreamField,
	DaydreamNarrator,
	DialValue,
	IdeaDials,
	IdeaFieldKind,
	IdeaOpening,
	IdeaTracker
} from '../daydream';
import { CHARACTER_FIELD_LABELS, fieldLabel, ideaFieldLabels } from './catalog';
import { CHARACTER_SLIDERS, CHARACTER_TONES, IDEA_SLIDERS } from './dial-words';

/** One field that differs: what it is called, and each side's value as shown. */
export type Difference<Key extends string> = {
	key: Key;
	label: string;
	here: string;
	library: string;
};

type Idea = {
	title: string;
	premise: string;
	yourRole: string;
	fields: readonly DaydreamField<IdeaFieldKind>[];
	openings: readonly IdeaOpening[];
	trackers: readonly IdeaTracker[];
	dials: IdeaDials;
};

type Character = {
	name: string;
	archetype: string;
	appearance: string;
	fields: readonly DaydreamField<CharacterFieldKind>[];
	dials: CharacterDials;
};

/** A field's key in a difference: its id, marked so it cannot be mistaken for a core field. */
export type FieldKey = `field:${string}`;

const IDEA_CORE = ['title', 'premise', 'yourRole'] as const;
const IDEA_DIALS = ['heat', 'kink'] as const;
const IDEA_LISTS = ['openings', 'trackers'] as const;

export type IdeaKey =
	| (typeof IDEA_CORE)[number]
	| (typeof IDEA_DIALS)[number]
	| (typeof IDEA_LISTS)[number]
	| FieldKey;

const CHARACTER_CORE = ['name', 'archetype', 'appearance'] as const;
const CHARACTER_DIAL_KEYS = ['tone', ...CHARACTER_SLIDERS.map((slider) => slider.key)] as const;

export type CharacterKey =
	| (typeof CHARACTER_CORE)[number]
	| (typeof CHARACTER_DIAL_KEYS)[number]
	| FieldKey;

const text = (value: string) => value.trim() || '(empty)';

const isFieldKey = (key: string): key is FieldKey => key.startsWith('field:');

function scaleLabel(
	sliders: readonly { key: string; scale: Record<DialValue, { label: string }> }[],
	key: string,
	value: DialValue | null
): string {
	return value === null
		? 'Not set'
		: (sliders.find((slider) => slider.key === key)?.scale[value].label ?? String(value));
}

/** A field as the comparison sees it: its name, what it says, and whether it is kept from view. */
function fieldShape(field: DaydreamField | undefined) {
	return field
		? JSON.stringify([field.kind, field.label.trim(), field.value.trim(), field.spoiler])
		: null;
}

/** A field's value as a difference shows it: never a spoiler's words. */
function fieldShown(field: DaydreamField | undefined): string {
	if (!field) {
		return '(not there)';
	}
	return field.spoiler ? '(a spoiler, kept hidden)' : text(field.value);
}

/** Every field id on either side, in the order they come: this copy's first. */
function fieldIds(here: readonly DaydreamField[], library: readonly DaydreamField[]): string[] {
	return [...new Set([...here, ...library].map((field) => field.id))];
}

/** The fields that differ, each named as whichever side has it calls it. */
function fieldDifferences(
	here: readonly DaydreamField[],
	library: readonly DaydreamField[],
	label: (field: DaydreamField) => string
): Difference<FieldKey>[] {
	return fieldIds(here, library).flatMap((id): Difference<FieldKey>[] => {
		const mine = here.find((field) => field.id === id);
		const theirs = library.find((field) => field.id === id);
		if (fieldShape(mine) === fieldShape(theirs)) {
			return [];
		}
		const named = mine ?? theirs;
		return named
			? [
					{
						key: `field:${id}`,
						label: label(named) || 'A field',
						here: fieldShown(mine),
						library: fieldShown(theirs)
					}
				]
			: [];
	});
}

/** `fields` with one field taken from `source`: replaced, added at the end, or removed. */
function takeField<Field extends DaydreamField>(
	fields: readonly Field[],
	source: readonly Field[],
	key: FieldKey
): Field[] {
	const id = key.slice('field:'.length);
	const taken = source.find((field) => field.id === id);
	if (!taken) {
		return fields.filter((field) => field.id !== id);
	}
	return fields.some((field) => field.id === id)
		? fields.map((field) => (field.id === id ? taken : field))
		: [...fields, taken];
}

/** An idea's openings or trackers as a comparison sees them, without their ids. */
function listShape(items: readonly object[]): string {
	return JSON.stringify(items.map(({ id: _id, ...rest }: { id?: unknown }) => rest));
}

function listShown(key: (typeof IDEA_LISTS)[number], idea: Idea): string {
	const names =
		key === 'openings'
			? idea.openings.map((opening) => opening.label)
			: idea.trackers.map((tracker) => tracker.name);
	return names.length > 0 ? names.join(', ') : '(none)';
}

const LIST_LABELS = { openings: 'Where it can start', trackers: 'What it keeps track of' } as const;

/** The idea's fields that differ between this daydream's copy and the library's. */
export function ideaDifferences(
	here: Idea,
	library: Idea,
	narrator?: DaydreamNarrator
): Difference<IdeaKey>[] {
	const labels = ideaFieldLabels(narrator);
	const core = IDEA_CORE.flatMap((key): Difference<IdeaKey>[] =>
		here[key].trim() === library[key].trim()
			? []
			: [
					{
						key,
						label: key === 'title' ? 'Title' : labels[key].label,
						here: text(here[key]),
						library: text(library[key])
					}
				]
	);
	const fields = fieldDifferences(here.fields, library.fields, (field) =>
		fieldLabel(field, 'idea', narrator)
	);
	const lists = IDEA_LISTS.flatMap((key): Difference<IdeaKey>[] =>
		listShape(here[key]) === listShape(library[key])
			? []
			: [
					{
						key,
						label: LIST_LABELS[key],
						here: listShown(key, here),
						library: listShown(key, library)
					}
				]
	);
	const dials = IDEA_DIALS.flatMap((key): Difference<IdeaKey>[] =>
		here.dials[key] === library.dials[key]
			? []
			: [
					{
						key,
						label: key === 'heat' ? 'Heat' : 'Kink',
						here: scaleLabel(IDEA_SLIDERS, key, here.dials[key]),
						library: scaleLabel(IDEA_SLIDERS, key, library.dials[key])
					}
				]
	);
	return [...core, ...fields, ...lists, ...dials];
}

/** `target` with one of the idea's fields taken from `source`. */
export function takeIdeaField<T extends Idea>(target: T, source: Idea, key: IdeaKey): T {
	if (isFieldKey(key)) {
		return { ...target, fields: takeField(target.fields, source.fields, key) };
	}
	if (key === 'heat' || key === 'kink') {
		return { ...target, dials: { ...target.dials, [key]: source.dials[key] } };
	}
	return { ...target, [key]: structuredClone(source[key]) };
}

function characterDialShown(character: Character, key: (typeof CHARACTER_DIAL_KEYS)[number]) {
	if (key === 'tone') {
		return CHARACTER_TONES.find((tone) => tone.value === character.dials.tone)?.label ?? 'Not set';
	}
	return scaleLabel(CHARACTER_SLIDERS, key, character.dials[key]);
}

function characterDialLabel(key: (typeof CHARACTER_DIAL_KEYS)[number]): string {
	return key === 'tone'
		? 'Tone'
		: (CHARACTER_SLIDERS.find((slider) => slider.key === key)?.label ?? key);
}

/** A character's fields and dials that differ between this daydream's copy and the library's. */
export function characterDifferences(
	here: Character,
	library: Character
): Difference<CharacterKey>[] {
	const core = CHARACTER_CORE.flatMap((key): Difference<CharacterKey>[] =>
		here[key].trim() === library[key].trim()
			? []
			: [
					{
						key,
						label: key === 'name' ? 'Name' : CHARACTER_FIELD_LABELS[key].label,
						here: text(here[key]),
						library: text(library[key])
					}
				]
	);
	const fields = fieldDifferences(here.fields, library.fields, (field) =>
		fieldLabel(field, 'character')
	);
	const dials = CHARACTER_DIAL_KEYS.flatMap((key): Difference<CharacterKey>[] =>
		here.dials[key] === library.dials[key]
			? []
			: [
					{
						key,
						label: characterDialLabel(key),
						here: characterDialShown(here, key),
						library: characterDialShown(library, key)
					}
				]
	);
	return [...core, ...fields, ...dials];
}

/** `target` with one of a character's fields or dials taken from `source`. */
export function takeCharacterField<T extends Character>(
	target: T,
	source: Character,
	key: CharacterKey
): T {
	if (isFieldKey(key)) {
		return { ...target, fields: takeField(target.fields, source.fields, key) };
	}
	if (key === 'name' || key === 'archetype' || key === 'appearance') {
		return { ...target, [key]: source[key] };
	}
	return { ...target, dials: { ...target.dials, [key]: source.dials[key] } };
}
