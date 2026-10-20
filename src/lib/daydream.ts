/**
 * Daydreams, the pure half: the shape of a setup and its parts, the size
 * limits every side holds them to, which voices make sense, and the words the
 * screens use for them. See docs/daydreams.md.
 *
 * Alias-free, like `types.ts`: the Drizzle schema imports `DaydreamTurnRole`
 * from here, and drizzle-kit loads the schema outside Vite.
 */

/**
 * Who wrote a turn: the user, or the model telling the story. The one thing
 * about a turn the server can read; what kind of turn it is (something said,
 * a direction pressed, a roll, a safety signal) is sealed with its content.
 *
 * Stored as `'character'` before narrators existed, and renamed by migration
 * 0034, because a turn may now be written by a narrator with no character in
 * the story at all.
 */
export type DaydreamTurnRole = 'user' | 'story';

/** Who leads the idea. Steers the characters' voices; nothing else reads it. */
export type DaydreamLead = 'character' | 'me' | 'shared';

export const DAYDREAM_LEADS: readonly { value: DaydreamLead; label: string }[] = [
	{ value: 'character', label: 'They lead' },
	{ value: 'me', label: 'I lead' },
	{ value: 'shared', label: 'We take turns' }
];

// ── voice ────────────────────────────────────────────────────────────────────

/**
 * Who tells the story. `none` is the characters speaking for themselves;
 * `monologue` is one voice speaking its mind, a stand-in for the story's
 * ideas rather than a character (docs/daydreams.md, "Voices").
 */
export type DaydreamNarrator =
	| 'none'
	| 'second-person'
	| 'third-person'
	| 'impersonal'
	| 'monologue';

/**
 * Where the user stands in it: as themselves, as someone they name, or
 * outside it altogether, watching and directing.
 */
export type DaydreamStance = 'self' | 'persona' | 'absent';

export type DaydreamVoice = {
	narrator: DaydreamNarrator;
	stance: DaydreamStance;
	/** What the story calls the user. Required for `persona`; optional for `self`; unused for `absent`. */
	protagonistName: string;
};

/**
 * The two settings under "Fine-tune how it's told". Each option shows only its
 * label; the picker describes the selected one beside the list
 * (`DaydreamVoicePicker.svelte`), with `description` and an `example` line.
 */
export const DAYDREAM_NARRATORS: readonly {
	value: DaydreamNarrator;
	label: string;
	description: string;
	example: string;
}[] = [
	{
		value: 'none',
		label: 'The characters',
		description: 'No narrator: the characters speak for themselves, to you.',
		example: '“Sit. No — closer. I want to see your face when I tell you.”'
	},
	{
		value: 'second-person',
		label: 'A narrator, to you',
		description: 'A narrator tells the story to you, as it happens to you.',
		example: '“You feel the rope tighten as the door clicks shut behind you.”'
	},
	{
		value: 'third-person',
		label: 'A narrator, about them',
		description: 'A narrator tells the story about the people in it.',
		example: '“She waits by the door, counting his footsteps on the stairs.”'
	},
	{
		value: 'impersonal',
		label: 'A system',
		description:
			'No narrator and no people: rules, notices and instructions, with what you do logged.',
		example: '“Kneel at the line. Wait for the tone.”'
	},
	{
		value: 'monologue',
		label: 'A monologue',
		description:
			'One voice speaking its mind about what the daydream is about, statement after statement, rather than telling a story.',
		example: '“**Being owned is a relief.** I mean it. Someone else decides, and I get to stop.”'
	}
];

export const DAYDREAM_STANCES: readonly {
	value: DaydreamStance;
	label: string;
	description: string;
}[] = [
	{ value: 'self', label: 'As myself', description: 'You are in the daydream, as yourself.' },
	{
		value: 'persona',
		label: 'As someone else',
		description: 'You are in the daydream, playing a character you name.'
	},
	{
		value: 'absent',
		label: 'Watching',
		description: 'You are not in the daydream: you watch it, and steer it from outside.'
	}
];

/**
 * One-tap starting points for the voice. Each fills both settings; the
 * pickers below them can then change either. Every one passes `voiceProblem`
 * with the character count it describes.
 *
 * The list shows only `label`; the selected one's `description` and
 * `examples` are shown beside it, so the choice is made from what the daydream
 * will read like rather than from a definition.
 */
export const DAYDREAM_VOICE_PRESETS: readonly {
	id: DaydreamVoicePresetId;
	label: string;
	description: string;
	examples: readonly string[];
	voice: Pick<DaydreamVoice, 'narrator' | 'stance'>;
}[] = [
	{
		id: 'talk',
		label: 'Talk with a character',
		description:
			'One or more characters speak to you directly, as if you were there. There is no narrator: what happens comes through what they say and do.',
		examples: [
			'“Sit. No — closer. I want to see your face when I tell you.”',
			'*sets the key on the table between you* “You’re late again.”'
		],
		voice: { narrator: 'none', stance: 'self' }
	},
	{
		id: 'told',
		label: 'A story told to you',
		description:
			'A narrator tells the story to you, as it happens to you. Characters are optional: it can be just you and the world.',
		examples: [
			'“You feel the rope tighten as the door clicks shut behind you.”',
			'“The rain has not stopped for three days, and you are the only one still awake.”'
		],
		voice: { narrator: 'second-person', stance: 'self' }
	},
	{
		id: 'watch',
		label: 'Watch a story unfold',
		description:
			'A narrator tells a story about other people. You are not in it: you watch, and steer it from outside.',
		examples: [
			'“She waits by the door, counting his footsteps on the stairs.”',
			'“Across the room, Ash finally looks up.”'
		],
		voice: { narrator: 'third-person', stance: 'absent' }
	},
	{
		id: 'rules',
		label: 'A system in charge',
		description:
			'No narrator, just rules giving you orders: notices, numbered rules and exact instructions, with every infraction logged.',
		examples: [
			'“Rule 2: Kneel at the line. Wait for the tone.”',
			'“Rule 2 broken. Infraction logged.”'
		],
		voice: { narrator: 'impersonal', stance: 'self' }
	},
	{
		id: 'monologue',
		label: 'A monologue',
		description:
			'One voice speaking its mind, with little story around it: the ideas, tropes and sayings of what you are into, said statement by statement, each with a little more after it. The voice stands in for those ideas rather than being a character of its own.',
		examples: [
			'“**Being owned is a relief.** I mean it. Someone else decides, and I get to stop deciding.”',
			'“**Good girls say thank you.** Every time. Even when it stings — especially then.”'
		],
		voice: { narrator: 'monologue', stance: 'self' }
	}
];

export type DaydreamVoicePresetId = 'talk' | 'told' | 'watch' | 'rules' | 'monologue';

/** The preset a voice is, or undefined for a combination no preset gives. */
export function voicePreset(voice: Pick<DaydreamVoice, 'narrator' | 'stance'>) {
	return DAYDREAM_VOICE_PRESETS.find(
		(preset) => preset.voice.narrator === voice.narrator && preset.voice.stance === voice.stance
	);
}

/**
 * The voice a setup gets until the user picks one: whatever fits who is in
 * it. Nobody in it is a story told to you; anyone is talking with them.
 * Watching, a system and a monologue are only ever chosen, never guessed,
 * because each changes what the daydream is rather than just how it is told.
 * What it calls the user is kept.
 */
export function inferVoice(current: DaydreamVoice, characterCount: number): DaydreamVoice {
	const preset = characterCount === 0 ? 'told' : 'talk';
	const { voice } = DAYDREAM_VOICE_PRESETS.find((candidate) => candidate.id === preset) ?? {
		voice: { narrator: 'none', stance: 'self' } as const
	};
	return { ...current, ...voice };
}

/** The most characters one daydream can have. More than this and none of them gets a voice. */
export const MAX_DAYDREAM_CHARACTERS = 4;

/**
 * Why a voice does not work with this many characters, in words for the
 * form, or null when it does. The setup kind refuses the same combinations,
 * so a stale page cannot store one.
 */
export function voiceProblem(voice: DaydreamVoice, characterCount: number): string | null {
	if (voice.narrator === 'none' && characterCount === 0) {
		return 'With no narrator, someone has to speak: add a character, or choose a narrator.';
	}
	if (voice.narrator === 'none' && voice.stance === 'absent') {
		return 'With no narrator, the characters speak to you, so you have to be in the daydream.';
	}
	// A monologue can be overheard with nobody in it: the voice is enough.
	if (voice.stance === 'absent' && characterCount === 0 && voice.narrator !== 'monologue') {
		return 'To watch, add at least one character to watch.';
	}
	if (voice.narrator === 'second-person' && voice.stance === 'absent') {
		return 'A narrator talking to “you” needs you in the daydream.';
	}
	if (voice.stance === 'persona' && voice.protagonistName.trim() === '') {
		return 'Give the person you are playing a name.';
	}
	return null;
}

/** Whether the voice can work with some number of characters, for disabling choices that never could. */
export function voiceCanWork(voice: Pick<DaydreamVoice, 'narrator' | 'stance'>): boolean {
	const named = { ...voice, protagonistName: 'x' };
	for (let count = 0; count <= MAX_DAYDREAM_CHARACTERS; count += 1) {
		if (voiceProblem(named, count) === null) {
			return true;
		}
	}
	return false;
}

/**
 * Whether "who leads" means anything: there are characters, and the user is
 * there to be led. Nobody leads a monologue: one voice says its piece.
 */
export function leadApplies(voice: DaydreamVoice, characterCount: number): boolean {
	return characterCount > 0 && voice.stance !== 'absent' && voice.narrator !== 'monologue';
}

// ── characters ───────────────────────────────────────────────────────────────

export type CharacterTone = 'warm' | 'teasing' | 'cold' | 'clinical';

/** A slider's value, 1 to 5, or null for "not set". */
export type DialValue = 1 | 2 | 3 | 4 | 5;

/**
 * A friendly shortcut for describing a character, alongside the free text.
 * Each is optional: a dial left unset says nothing, rather than "middling".
 */
export type CharacterDials = {
	tone: CharacterTone | null;
	/** Follows ↔ takes charge. */
	control: DialValue | null;
	/** Lenient ↔ strict. */
	strictness: DialValue | null;
	/** Gentle ↔ cruel. */
	edge: DialValue | null;
	/** Terse ↔ chatty. */
	talk: DialValue | null;
	/** Chaste ↔ slutty: how much they want sex, and how openly. */
	libido: DialValue | null;
	/** Vanilla ↔ depraved. */
	kink: DialValue | null;
};

export const UNSET_CHARACTER_DIALS: CharacterDials = {
	tone: null,
	control: null,
	strictness: null,
	edge: null,
	talk: null,
	libido: null,
	kink: null
};

/**
 * A character as the library holds it and a daydream copies it: who they
 * are in any story. Free text is the truth.
 *
 * Nothing here depends on the idea. Who they are to the user, and what they
 * are doing, change from one story to the next, so they live on the
 * daydream's casting (`DaydreamCasting`) instead — which is what lets one
 * character be reused across ideas without being rewritten for each.
 */
export type DaydreamCharacter = {
	name: string;
	archetype: string;
	personality: string;
	/** How they talk. */
	speech: string;
	appearance: string;
	likes: string;
	notes: string;
	dials: CharacterDials;
};

/** The character fields a person writes in, in the order the dialog shows them. */
export const CHARACTER_TEXT_FIELDS = [
	'archetype',
	'personality',
	'speech',
	'appearance',
	'likes',
	'notes'
] as const satisfies readonly (keyof DaydreamCharacter)[];

export type CharacterTextField = (typeof CHARACTER_TEXT_FIELDS)[number];

/** The ones the dialog shows before "More detail": enough to have someone to play with. */
export const CHARACTER_PRIMARY_FIELDS = [
	'archetype',
	'personality'
] as const satisfies readonly CharacterTextField[];

export const EMPTY_CHARACTER: DaydreamCharacter = {
	name: '',
	archetype: '',
	personality: '',
	speech: '',
	appearance: '',
	likes: '',
	notes: '',
	dials: UNSET_CHARACTER_DIALS
};

// ── ideas ───────────────────────────────────────────────────────────────────

/**
 * A part an idea has for a character to play: "the interviewer", "the one
 * who won the bet". Characters are cast into parts, so an idea reads as a
 * plot any fitting character can step into.
 */
export type IdeaPart = {
	/** Stable across edits, so a daydream's castings survive the idea changing. */
	id: string;
	name: string;
	description: string;
};

/**
 * How sexual and how kinky an idea is. Each is optional, like a character's
 * dials: unset says nothing, and the model follows the idea's words. Heat is
 * the ceiling for everyone in it — at its lowest the story is not sexual at
 * all, whatever a character's libido — which is how a daydream is made SFW.
 */
export type IdeaDials = {
	/** SFW ↔ filthy. */
	heat: DialValue | null;
	/** Vanilla ↔ extreme. */
	kink: DialValue | null;
};

export const UNSET_IDEA_DIALS: IdeaDials = { heat: null, kink: null };

export type DaydreamIdea = {
	title: string;
	/** Where it happens. */
	setting: string;
	/** What is going on as it starts. */
	premise: string;
	/** Who the user is in it, when they are in it: the user's own part. */
	yourRole: string;
	/** A few words: playful, strict, slow-burn. */
	tone: string;
	notes: string;
	/** The parts it has for characters. Optional: an idea with none is cast freely. */
	parts: IdeaPart[];
	dials: IdeaDials;
};

export const IDEA_TEXT_FIELDS = [
	'setting',
	'premise',
	'yourRole',
	'tone',
	'notes'
] as const satisfies readonly (keyof DaydreamIdea)[];

export type IdeaTextField = (typeof IDEA_TEXT_FIELDS)[number];

/**
 * The ones the dialog shows before "More detail", besides the title and the
 * parts. A monologue's sayings are what it is built from, so for one they
 * are up front too, where a story keeps its notes for whatever is left over.
 */
export function ideaPrimaryFields(
	narrator: DaydreamNarrator | undefined
): readonly IdeaTextField[] {
	return narrator === 'monologue' ? ['premise', 'notes'] : ['premise'];
}

export const EMPTY_IDEA: DaydreamIdea = {
	title: '',
	setting: '',
	premise: '',
	yourRole: '',
	tone: '',
	notes: '',
	parts: [],
	dials: UNSET_IDEA_DIALS
};

// ── a daydream's setup ───────────────────────────────────────────────────────

/**
 * Where a daydream's copy of a character or idea came from: the library
 * record and the revision it was copied at. Both null for a copy with no
 * library record — one made from a v1 setup, or created without saving.
 *
 * A copy, not a reference, so editing or deleting the library record never
 * changes a story under way; `outOfSync` (`daydream/chips.ts`) notices when the
 * library has moved on, and the setup page offers to catch up.
 */
export type CopySource = { sourceId: string | null; sourceRevision: number | null };

/**
 * Who a character is in one daydream: the half of them that depends on the
 * story. Kept on the daydream's copy and never saved to the library, so
 * casting someone differently never makes their library record look changed,
 * and catching up with the library never loses their part.
 */
export type DaydreamCasting = {
	/** The idea part they play (`IdeaPart.id`), or null for someone cast without one. */
	partId: string | null;
	/** Who they are to the user, in this story. */
	relationship: string;
	/** What they are doing, or want, in this idea. */
	part: string;
};

export const EMPTY_CASTING: DaydreamCasting = { partId: null, relationship: '', part: '' };

/** A character as a daydream holds it: the library's copy, and their casting in this story. */
export type DaydreamCharacterCopy = DaydreamCharacter & CopySource & { casting: DaydreamCasting };
export type DaydreamIdeaCopy = DaydreamIdea & CopySource;

export type PassageLength = 'short' | 'medium' | 'long';

/** The story's sticky dials: sent with every reply until they are changed. */
export type StoryDials = {
	intensity: DialValue;
	pace: DialValue;
	length: PassageLength;
};

export const DEFAULT_STORY_DIALS: StoryDials = { intensity: 3, pace: 3, length: 'medium' };

/** How a daydream's pictures look (`daydream/image-prompt.ts`). */
export type PictureStyle = 'photo' | 'illustrated';

/**
 * A daydream's pictures (docs/daydreams.md, "Pictures"): whether each passage
 * gets one made by itself, and in which style. Neither is sent to the story
 * model as such; the style only decides which recipe its picture
 * descriptions follow, so switching it to a model of another family
 * (`PictureArchitecture`) changes its prompt, and costs one uncached request.
 */
export type DaydreamPictures = { on: boolean; style: PictureStyle };

export const DEFAULT_PICTURES: DaydreamPictures = { on: true, style: 'photo' };

/** What a daydream is set up with, as the setup form edits it and the model reads it. */
export type DaydreamSetup = {
	/** Empty until it is named: the model names it after the opening (`daydreamTitle`). */
	title: string;
	voice: DaydreamVoice;
	characters: DaydreamCharacterCopy[];
	idea: DaydreamIdeaCopy;
	lead: DaydreamLead;
	/** What must not happen, in the user's words. */
	limits: string;
	dials: StoryDials;
	pictures: DaydreamPictures;
};

/** What a daydream is called on screen: its own name, or its idea's until it has one. */
export function daydreamTitle(setup: { title: string; idea: { title: string } }): string {
	return setup.title.trim() || setup.idea.title;
}

/**
 * Why the casting does not fit the idea, or null when it does: every part
 * cast is one the idea has, and none is cast twice. The setup kind refuses
 * the same, so a stale page cannot store one.
 */
export function castingProblem(
	characters: readonly { casting: Pick<DaydreamCasting, 'partId'> }[],
	parts: readonly Pick<IdeaPart, 'id'>[]
): string | null {
	const cast = characters.flatMap(({ casting }) =>
		casting.partId === null ? [] : [casting.partId]
	);
	if (cast.some((id) => !parts.some((part) => part.id === id))) {
		return 'Someone is cast in a part the idea no longer has.';
	}
	return new Set(cast).size === cast.length
		? null
		: 'Each part can only be played by one character.';
}

/** The castings again, with any part the idea no longer has let go. Their words are kept. */
export function fitCastingToIdea<T extends { casting: DaydreamCasting }>(
	characters: readonly T[],
	parts: readonly Pick<IdeaPart, 'id'>[]
): T[] {
	return characters.map((character) =>
		character.casting.partId === null || parts.some((part) => part.id === character.casting.partId)
			? character
			: { ...character, casting: { ...character.casting, partId: null } }
	);
}

/**
 * Lengths, in characters of visible text.
 *
 * Shared by the sealed kinds, the forms, the reply endpoint's checks and the
 * context trimming, so that what one side accepts the others do too. The
 * turn limit is generous because a reply is often several paragraphs; the
 * reply endpoint still caps how much of a conversation it forwards
 * (`MAX_CONTEXT_CHARS`), whatever a single turn may hold.
 *
 * `personality` and `premise` match the v1 setup's `persona` and `scenario`,
 * which the upcaster carries into them unchanged.
 */
export const DAYDREAM_LIMITS = {
	title: 80,
	protagonistName: 60,
	characterName: 60,
	archetype: 200,
	personality: 2000,
	speech: 500,
	appearance: 500,
	relationship: 300,
	castPart: 500,
	likes: 500,
	characterNotes: 1000,
	setting: 500,
	premise: 2000,
	yourRole: 300,
	tone: 200,
	ideaNotes: 1000,
	partName: 60,
	partDescription: 300,
	limits: 1000,
	/** The brief a daydream is written from on the new-daydream page: what the user typed. */
	brief: 500,
	turn: 8000,
	/**
	 * A reply exactly as the model wrote it, kept for debug mode's raw log
	 * (docs/debug-mode.md). Replies are asked for at 1200 tokens, a few
	 * thousand characters, so this is a ceiling a runaway reply hits rather
	 * than one a normal one comes near.
	 */
	rawReply: 16_000,
	/**
	 * What a request sent, recorded for the raw log alongside `raw`
	 * (`daydream/sent-record.ts`): the system prompt, and what the request
	 * added after the last passage. A setup at every limit makes a system
	 * prompt of around this; a usual one is a few thousand characters.
	 */
	sentSystem: 24_000,
	sentAdded: 10_000,
	suggestion: 300,
	directionLabel: 40,
	quote: 1000,
	instruction: 500,
	bookmarkLabel: 80,
	rollPrompt: 140,
	rollOutcome: 80,
	/**
	 * A passage's picture, described by the model for the image model
	 * (`daydream/image-prompt.ts`). SDXL reads well under this; the server
	 * adds its own style and safety words around it.
	 */
	imagePrompt: 1000
} as const;

/**
 * The most conversation one reply request may carry, in characters of turn
 * text. The browser trims to it (`daydream/context.ts`), keeping the newest
 * turns, and the server refuses anything over it. Roughly 15k tokens: enough
 * memory for a long idea, small enough that a reply stays cheap and fast.
 */
export const MAX_CONTEXT_CHARS = 60_000;

/** The most turns one reply request may carry, whatever their length. */
export const MAX_CONTEXT_TURNS = 200;

/** The most direction buttons shown at once, besides the ones that are always there. */
export const MAX_DIRECTIONS = 6;

/** The most suggested responses offered under a passage. */
export const MAX_SUGGESTIONS = 4;
