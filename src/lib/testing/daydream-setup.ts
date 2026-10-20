import {
	type DaydreamCharacterCopy,
	type DaydreamIdeaCopy,
	type DaydreamSetup,
	DEFAULT_PICTURES,
	DEFAULT_STORY_DIALS,
	EMPTY_CASTING,
	UNSET_CHARACTER_DIALS,
	UNSET_IDEA_DIALS
} from '../daydream';

/**
 * Daydream setups for tests: valid v2 setups (they pass `daydreamSetupKind`),
 * built from a few overrides rather than spelled out in full in every file.
 */

export function testCharacter(
	overrides: Partial<DaydreamCharacterCopy> = {}
): DaydreamCharacterCopy {
	return {
		sourceId: null,
		sourceRevision: null,
		name: 'Mara',
		archetype: '',
		personality: '',
		speech: '',
		appearance: '',
		likes: '',
		notes: '',
		dials: UNSET_CHARACTER_DIALS,
		casting: EMPTY_CASTING,
		...overrides
	};
}

export function testIdea(overrides: Partial<DaydreamIdeaCopy> = {}): DaydreamIdeaCopy {
	return {
		sourceId: null,
		sourceRevision: null,
		title: 'Late meeting',
		setting: '',
		premise: 'The office has emptied out.',
		yourRole: '',
		tone: '',
		notes: '',
		parts: [],
		dials: UNSET_IDEA_DIALS,
		...overrides
	};
}

/** One character speaking to the user as themselves: the shape every v1 daydream had. */
export function testDaydreamSetup(overrides: Partial<DaydreamSetup> = {}): DaydreamSetup {
	return {
		title: 'Late meeting',
		voice: { narrator: 'none', stance: 'self', protagonistName: '' },
		characters: [testCharacter()],
		idea: testIdea(),
		lead: 'character',
		limits: '',
		dials: DEFAULT_STORY_DIALS,
		pictures: DEFAULT_PICTURES,
		...overrides
	};
}
