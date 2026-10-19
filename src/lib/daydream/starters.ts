/**
 * Whole daydreams to start from: the ready-made stories on the new-daydream
 * page, and the assembly that turns a story described in pieces — by one of
 * those, or by the model from a sentence the user wrote — into a setup the
 * form can open.
 *
 * Ready-made stories are built from the starting points in `catalog.ts`
 * rather than written out again: a scene template, a voice, and character
 * templates cast into the scene's parts, with who they are in this story
 * written here, since that depends on the story (docs/daydreams.md,
 * "Characters, scenes and casting"). Like the rest of the catalog they run
 * the whole range, in order of heat, and say their level.
 *
 * Pure and alias-free.
 */

import {
	DAYDREAM_VOICE_PRESETS,
	type DaydreamCharacter,
	type DaydreamScene,
	type DaydreamSetup,
	type DaydreamVoicePresetId,
	DEFAULT_STORY_DIALS,
	EMPTY_CASTING,
	inferVoice,
	MAX_DAYDREAM_CHARACTERS,
	voiceProblem
} from '../daydream';
import { CHARACTER_TEMPLATES, SCENE_TEMPLATES } from './catalog';
import type { SuggestedPart } from './suggestions';

/** One person in a story described in pieces, and who they are in it. */
export type StoryCast = {
	character: DaydreamCharacter;
	/** The name of the scene's part they play, or null for none in particular. */
	partName: string | null;
	relationship: string;
	/** What they are doing, or want, as it starts: the casting's `part`. */
	doing: string;
};

/** A story described in pieces, before it has ids or a voice that is sure to work. */
export type StoryPieces = {
	/** Null to have it follow who is in it (`inferVoice`). */
	voice: DaydreamVoicePresetId | null;
	scene: Omit<DaydreamScene, 'parts'> & { parts: readonly SuggestedPart[] };
	cast: readonly StoryCast[];
};

/**
 * A setup from a story in pieces. Parts get fresh ids, each person is cast
 * into the part named for them if it is still free (by name, ignoring case),
 * and a voice that cannot work with who is in it — watching nobody, say —
 * gives way to the one that follows them. Nothing is from the library, so
 * every copy is one with no source.
 */
export function assembleSetup(
	pieces: StoryPieces,
	newId: () => string = () => crypto.randomUUID()
): DaydreamSetup {
	const parts = pieces.scene.parts.map((part) => ({ ...part, id: newId() }));
	const taken = new Set<string>();
	const cast = pieces.cast.slice(0, MAX_DAYDREAM_CHARACTERS);
	const characters = cast.map(({ character, partName, relationship, doing }) => {
		const part = parts.find(
			(candidate) =>
				!taken.has(candidate.id) &&
				partName !== null &&
				candidate.name.toLocaleLowerCase() === partName.trim().toLocaleLowerCase()
		);
		if (part) {
			taken.add(part.id);
		}
		return {
			...structuredClone(character),
			sourceId: null,
			sourceRevision: null,
			casting: { ...EMPTY_CASTING, partId: part?.id ?? null, relationship, part: doing }
		};
	});

	const chosen = DAYDREAM_VOICE_PRESETS.find((preset) => preset.id === pieces.voice);
	const unnamed = { narrator: 'none', stance: 'self', protagonistName: '' } as const;
	const voice = chosen ? { ...unnamed, ...chosen.voice } : inferVoice(unnamed, characters.length);

	return {
		title: '',
		voice:
			voiceProblem(voice, characters.length) === null
				? voice
				: inferVoice(voice, characters.length),
		characters,
		scene: { ...pieces.scene, parts, sourceId: null, sourceRevision: null },
		lead: 'character',
		limits: '',
		dials: DEFAULT_STORY_DIALS
	};
}

// ── ready-made stories ───────────────────────────────────────────────────────

export type DaydreamStarter = {
	id: string;
	voice: DaydreamVoicePresetId;
	/** A `SCENE_TEMPLATES` id. */
	scene: string;
	cast: readonly {
		/** A `CHARACTER_TEMPLATES` id. */
		character: string;
		/** The name of the scene template's part they play. */
		part: string;
		relationship: string;
		doing: string;
	}[];
};

/** Ready-made stories, in the scenes' order: by heat, SFW first. */
export const DAYDREAM_STARTERS: readonly DaydreamStarter[] = [
	{
		id: 'lighthouse',
		voice: 'talk',
		scene: 'lighthouse',
		cast: [
			{
				character: 'rogue',
				part: 'the stranger',
				relationship: 'a stranger the storm brought to your door',
				doing: 'soaked through, charming, and lying about how they got here'
			}
		]
	},
	{
		id: 'long-drive',
		voice: 'told',
		scene: 'long-drive',
		cast: [
			{
				character: 'old-friend',
				part: 'the driver',
				relationship: 'your oldest friend, back after years away',
				doing: 'driving you both somewhere they will not name yet'
			}
		]
	},
	{
		id: 'masquerade',
		voice: 'talk',
		scene: 'masquerade',
		cast: [
			{
				character: 'tease',
				part: 'the stranger in the mask',
				relationship: 'a stranger, as far as you know',
				doing: 'has been watching you all night, and finally makes a move'
			}
		]
	},
	{
		id: 'cabin',
		voice: 'told',
		scene: 'cabin',
		cast: [
			{
				character: 'caretaker',
				part: 'the one who planned it',
				relationship: 'your partner',
				doing: 'planned every minute of the weekend for you'
			}
		]
	},
	{
		id: 'after-hours',
		voice: 'talk',
		scene: 'after-hours',
		cast: [
			{
				character: 'aristocrat',
				part: 'the interviewer',
				relationship: 'the boss you are interviewing with',
				doing: 'has already decided to hire you, and wants to see how far you will go for it'
			}
		]
	},
	{
		id: 'facility',
		voice: 'rules',
		scene: 'facility',
		cast: [
			{
				character: 'mentor',
				part: 'the instructor',
				relationship: 'the one who decides whether you pass',
				doing: 'runs your assessment, strictly by the book'
			}
		]
	},
	{
		id: 'lost-bet',
		voice: 'talk',
		scene: 'lost-bet',
		cast: [
			{
				character: 'brat',
				part: 'the winner',
				relationship: 'your housemate',
				doing: 'won the bet, and means to be insufferable about collecting'
			}
		]
	},
	{
		id: 'hotel-room',
		voice: 'told',
		scene: 'hotel-room',
		cast: [
			{
				character: 'neighbour',
				part: 'the hookup',
				relationship: 'someone you met online',
				doing: 'already in the room when you arrive'
			}
		]
	},
	{
		id: 'dungeon',
		voice: 'talk',
		scene: 'dungeon',
		cast: [
			{
				character: 'sadist',
				part: 'the host',
				relationship: 'a stranger who has heard all about you',
				doing: 'presenting you to the room'
			},
			{
				character: 'tease',
				part: 'the regular',
				relationship: 'someone who has had their eye on you all night',
				doing: 'first in line for you'
			}
		]
	}
];

/** The scene template a starter is built on. Throws for a starter that names one that is not there. */
export function starterScene(starter: DaydreamStarter) {
	const template = SCENE_TEMPLATES.find((entry) => entry.id === starter.scene);
	if (!template) {
		throw new Error(`The "${starter.id}" starter names a scene template that does not exist`);
	}
	return template;
}

/** A ready-made story as a setup. Throws for one naming a template that is not there. */
export function starterSetup(starter: DaydreamStarter, newId?: () => string): DaydreamSetup {
	const cast = starter.cast.map(({ character, part, relationship, doing }) => {
		const template = CHARACTER_TEMPLATES.find((entry) => entry.id === character);
		if (!template) {
			throw new Error(`The "${starter.id}" starter names a character template that does not exist`);
		}
		return { character: template.character, partName: part, relationship, doing };
	});
	return assembleSetup({ voice: starter.voice, scene: starterScene(starter).scene, cast }, newId);
}

/**
 * Ideas to start the "describe it" box from. They toggle into it, like the
 * chips under a field, so they read as something a person might have typed.
 */
export const DAYDREAM_IDEA_CHIPS: readonly string[] = [
	'a flirty barista who remembers my order',
	'lost in a haunted house with a sceptic',
	'my strict new boss on my first day',
	'a stranger on a night train',
	'a knight sworn to protect me',
	'a house with strict rules and a curfew',
	'a rival who finally admits it',
	'being someone’s toy for the night'
];
