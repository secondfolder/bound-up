import {
	CHARACTER_FIELD_KINDS,
	type CharacterFieldKind,
	type DaydreamCharacterCopy,
	type DaydreamIdeaCopy,
	type DaydreamSetup,
	DEFAULT_PICTURES,
	DEFAULT_STORY_DIALS,
	EMPTY_CASTING,
	fieldsFrom,
	IDEA_FIELD_KINDS,
	type IdeaFieldKind,
	type StoryDials,
	UNSET_CHARACTER_DIALS,
	UNSET_IDEA_DIALS
} from '../daydream';

/**
 * Daydream setups for tests: valid setups (they pass `daydreamSetupKind`),
 * built from a few overrides rather than spelled out in full in every file.
 *
 * A known field can be given by its kind, as `{ personality: 'kind' }`, and
 * becomes that field; `fields` given outright replaces them all.
 */

type FieldOverrides<Kind extends string> = Partial<Record<Kind, string>>;

/** The overrides without the known kinds, and the known kinds as fields. */
function splitFields<Kind extends CharacterFieldKind | IdeaFieldKind, T extends object>(
	kinds: readonly Kind[],
	overrides: T & FieldOverrides<Kind>
) {
	const rest: Record<string, unknown> = {};
	const values: FieldOverrides<Kind> = {};
	for (const [key, value] of Object.entries(overrides)) {
		if ((kinds as readonly string[]).includes(key)) {
			values[key as Kind] = value as string;
		} else {
			rest[key] = value;
		}
	}
	return { rest: rest as Partial<T>, fields: fieldsFrom(kinds, values) };
}

export function testCharacter(
	overrides: Partial<DaydreamCharacterCopy> & FieldOverrides<CharacterFieldKind> = {}
): DaydreamCharacterCopy {
	const { rest, fields } = splitFields(CHARACTER_FIELD_KINDS, overrides);
	return {
		sourceId: null,
		sourceRevision: null,
		name: 'Mara',
		archetype: '',
		appearance: '',
		fields,
		dials: UNSET_CHARACTER_DIALS,
		casting: EMPTY_CASTING,
		...rest
	};
}

export function testIdea(
	overrides: Partial<DaydreamIdeaCopy> & FieldOverrides<IdeaFieldKind> = {}
): DaydreamIdeaCopy {
	const { rest, fields } = splitFields(IDEA_FIELD_KINDS, overrides);
	return {
		sourceId: null,
		sourceRevision: null,
		title: 'Late meeting',
		premise: 'The office has emptied out.',
		yourRole: '',
		fields,
		brief: '',
		research: '',
		parts: [],
		openings: [],
		trackers: [],
		dials: UNSET_IDEA_DIALS,
		...rest
	};
}

/**
 * One character speaking to the user as themselves: the shape every v1
 * daydream had. Dials given are laid over the defaults.
 */
export function testDaydreamSetup(
	overrides: Partial<Omit<DaydreamSetup, 'dials'>> & { dials?: Partial<StoryDials> } = {}
): DaydreamSetup {
	const { dials, ...rest } = overrides;
	return {
		title: 'Late meeting',
		voice: { narrator: 'none', stance: 'self', protagonistName: '' },
		characters: [testCharacter()],
		idea: testIdea(),
		lead: 'character',
		limits: '',
		pictures: DEFAULT_PICTURES,
		opening: null,
		...rest,
		dials: { ...DEFAULT_STORY_DIALS, ...dials }
	};
}
