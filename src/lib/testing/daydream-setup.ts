import {
	type DaydreamCharacterCopy,
	type DaydreamSceneCopy,
	type DaydreamSetup,
	DEFAULT_STORY_DIALS,
	UNSET_CHARACTER_DIALS
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
		relationship: '',
		likes: '',
		notes: '',
		dials: UNSET_CHARACTER_DIALS,
		...overrides
	};
}

export function testScene(overrides: Partial<DaydreamSceneCopy> = {}): DaydreamSceneCopy {
	return {
		sourceId: null,
		sourceRevision: null,
		title: 'Late meeting',
		setting: '',
		premise: 'The office has emptied out.',
		yourRole: '',
		tone: '',
		notes: '',
		...overrides
	};
}

/** One character speaking to the user as themselves: the shape every v1 daydream had. */
export function testDaydreamSetup(overrides: Partial<DaydreamSetup> = {}): DaydreamSetup {
	return {
		title: 'Late meeting',
		voice: { narrator: 'none', stance: 'self', protagonistName: '' },
		characters: [testCharacter()],
		scene: testScene(),
		lead: 'character',
		limits: '',
		dials: DEFAULT_STORY_DIALS,
		...overrides
	};
}
