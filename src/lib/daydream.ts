/**
 * Daydreams, the pure half: the shape of a setup and its parts, the size
 * limits every side holds them to, which voices make sense, and the words the
 * screens use for them. See docs/daydreams.md.
 *
 * Alias-free, like `types.ts`: the Drizzle schema imports `DaydreamTurnRole`
 * from here, and drizzle-kit loads the schema outside Vite.
 */

import { assertNever } from './assert-never';

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
	/**
	 * Whom a system governs, for the `impersonal` narrator: the user, unless
	 * this says a character (docs/daydreams.md, "Voices"). With a character
	 * governed, the system answers to the user, who is in charge of it — a
	 * dominant user's system of rules. Someone who only watches a system is
	 * always watching it govern a character (`systemGoverns`).
	 */
	governs?: 'character';
};

/**
 * Whom the system governs: a character when the voice says so, or when the
 * user only watches, since a system cannot order about someone who is not
 * there; otherwise the user. Only means anything for the `impersonal`
 * narrator.
 */
export function systemGoverns(
	voice: Pick<DaydreamVoice, 'stance' | 'governs'>
): 'user' | 'character' {
	return voice.governs === 'character' || voice.stance === 'absent' ? 'character' : 'user';
}

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
			'One voice speaking its mind about what the daydream is about, rather than telling a story.',
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
	// `governs` is said by every preset, so choosing one clears another's.
	voice: Pick<DaydreamVoice, 'narrator' | 'stance' | 'governs'>;
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
		voice: { narrator: 'none', stance: 'self', governs: undefined }
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
		voice: { narrator: 'second-person', stance: 'self', governs: undefined }
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
		voice: { narrator: 'third-person', stance: 'absent', governs: undefined }
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
		voice: { narrator: 'impersonal', stance: 'self', governs: undefined }
	},
	{
		id: 'command',
		label: 'A system you command',
		description:
			'No narrator, just rules — but they govern someone else, and answer to you. The system issues its orders to a character, logs what they do, and reports to you for your rulings.',
		examples: [
			'“Amendment 3, at the keyholder’s instruction: the subject kneels at the door from 19:00.”',
			'“Request from the subject: permission to speak. Awaiting your ruling.”'
		],
		voice: { narrator: 'impersonal', stance: 'self', governs: 'character' }
	},
	{
		id: 'monologue',
		label: 'A monologue',
		description:
			'One voice speaking its mind, with little story around it: the ideas, tropes and sayings of what you are into, in its own words. The voice stands in for those ideas rather than being a character of its own.',
		examples: [
			'“**Being owned is a relief.** I mean it. Someone else decides, and I get to stop deciding.”',
			'“**Good girls say thank you.** Every time. Even when it stings — especially then.”'
		],
		voice: { narrator: 'monologue', stance: 'self', governs: undefined }
	}
];

export type DaydreamVoicePresetId = 'talk' | 'told' | 'watch' | 'rules' | 'command' | 'monologue';

/** The preset a voice is, or undefined for a combination no preset gives. */
export function voicePreset(voice: Pick<DaydreamVoice, 'narrator' | 'stance' | 'governs'>) {
	return DAYDREAM_VOICE_PRESETS.find(
		(preset) =>
			preset.voice.narrator === voice.narrator &&
			preset.voice.stance === voice.stance &&
			preset.voice.governs === voice.governs
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
	if (voice.governs === 'character' && voice.narrator !== 'impersonal') {
		return 'Only a system governs someone else.';
	}
	if (
		voice.narrator === 'impersonal' &&
		systemGoverns(voice) === 'character' &&
		characterCount === 0
	) {
		return 'Add the character the system governs.';
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

// ── fields ───────────────────────────────────────────────────────────────────

/**
 * The kinds of field a character can have that the app knows: each has a
 * label, a hint, a length cap and chips of its own (`daydream/catalog.ts`).
 * The last three came from what the most popular character cards carry
 * beyond a standard sheet — what someone hides, the line they won't cross,
 * what it takes to win them over — which made a character read as a person
 * (docs/daydreams.md, "Fields").
 */
export const CHARACTER_FIELD_KINDS = [
	'personality',
	'speech',
	'likes',
	'hides',
	'wontDo',
	'wonOver',
	'notes'
] as const;

export type CharacterFieldKind = (typeof CHARACTER_FIELD_KINDS)[number];

/** The kinds of field an idea can have that the app knows. A monologue reads `notes` as its sayings. */
export const IDEA_FIELD_KINDS = ['setting', 'tone', 'notes'] as const;

export type IdeaFieldKind = (typeof IDEA_FIELD_KINDS)[number];

export type FieldKind = CharacterFieldKind | IdeaFieldKind;

/**
 * One field of a character or an idea: a known kind, or one the user (or a
 * suggestion) named. Besides a small fixed core that code depends on — a
 * character's name, type and appearance; an idea's title, premise and the
 * user's part — everything a character or idea says is a field, so a card
 * can carry the one or two things that make it what it is rather than a
 * standard sheet.
 *
 * A known kind's label is the catalog's (`fieldLabel`), not stored, so a
 * monologue's notes read as its sayings and a renamed label reaches every
 * record; `label` is the user's own only for a field with no kind.
 *
 * A spoiler is kept from the user: hidden behind "Show" wherever the field is
 * shown, never in a summary, and told to the model as something to reveal in
 * play rather than up front.
 */
export type DaydreamField<Kind extends FieldKind = FieldKind> = {
	/** Stable across edits. A known kind's is fixed (`KNOWN_FIELD_IDS`). */
	id: string;
	kind: Kind | null;
	/** The field's name, for one with no kind; empty for a known kind. */
	label: string;
	value: string;
	spoiler: boolean;
};

/** The most fields one character or idea has, besides its core. */
export const MAX_FIELDS = 12;

/**
 * A known kind's field id, the same in every record. A record holds each
 * known kind at most once, so a fixed id is enough to tell them apart, and it
 * is what lets a daydream's copy be compared with its library record field by
 * field even when both were upcast from fixed fields rather than written
 * with ids.
 */
export const KNOWN_FIELD_IDS: Readonly<Record<FieldKind, string>> = {
	personality: '00000000-0000-4000-8000-0000000f1e01',
	speech: '00000000-0000-4000-8000-0000000f1e02',
	likes: '00000000-0000-4000-8000-0000000f1e03',
	hides: '00000000-0000-4000-8000-0000000f1e04',
	wontDo: '00000000-0000-4000-8000-0000000f1e05',
	wonOver: '00000000-0000-4000-8000-0000000f1e06',
	notes: '00000000-0000-4000-8000-0000000f1e07',
	setting: '00000000-0000-4000-8000-0000000f1e08',
	tone: '00000000-0000-4000-8000-0000000f1e09'
};

/** A known field, written in. */
export function knownField<Kind extends FieldKind>(
	kind: Kind,
	value = '',
	spoiler = false
): DaydreamField<Kind> {
	return { id: KNOWN_FIELD_IDS[kind], kind, label: '', value, spoiler };
}

/**
 * Fields from values by kind, in `kinds`' order, leaving out the empty ones:
 * how a record written with fixed fields — an old one being upcast, a
 * starting point in the catalog — becomes one with fields.
 */
export function fieldsFrom<Kind extends FieldKind>(
	kinds: readonly Kind[],
	values: Partial<Record<Kind, string>>
): DaydreamField<Kind>[] {
	return kinds.flatMap((kind) => {
		const value = values[kind]?.trim() ?? '';
		return value ? [knownField(kind, value)] : [];
	});
}

/** What a known field says, or '' when the record has none. */
export function fieldText(fields: readonly DaydreamField[], kind: FieldKind): string {
	return fields.find((field) => field.kind === kind)?.value ?? '';
}

/**
 * A record's known fields by kind, as the suggestions are told them and
 * write them back: one key each, only those written in.
 */
export function knownValues<Kind extends FieldKind>(
	fields: readonly DaydreamField<Kind>[]
): Partial<Record<Kind, string>> {
	const values: Partial<Record<Kind, string>> = {};
	for (const field of fields) {
		if (field.kind !== null && field.value.trim()) {
			values[field.kind] = field.value;
		}
	}
	return values;
}

/** The fields a record's user named (no known kind), as the suggestions are told them. */
export function namedFields(
	fields: readonly DaydreamField[]
): { label: string; value: string; spoiler: boolean }[] {
	return fields
		.filter((field) => field.kind === null)
		.map(({ label, value, spoiler }) => ({ label, value, spoiler }));
}

/** The fields with a known one set to `value`, added at the end when it is not there yet. */
export function withField<Kind extends FieldKind>(
	fields: readonly DaydreamField<Kind>[],
	kind: Kind,
	value: string
): DaydreamField<Kind>[] {
	return fields.some((field) => field.kind === kind)
		? fields.map((field) => (field.kind === kind ? { ...field, value } : field))
		: [...fields, knownField(kind, value)];
}

// ── characters, continued ───────────────────────────────────────────────────

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
	/** Their type, in a few words: what a card and the casting suggestion name them by. */
	archetype: string;
	/** What they look like: what keeps them the same from picture to picture. */
	appearance: string;
	/** Everything else: personality, how they talk, what they hide… (`DaydreamField`). */
	fields: DaydreamField<CharacterFieldKind>[];
	dials: CharacterDials;
};

/** The character's own text besides their name and fields, in the order the dialog shows them. */
export const CHARACTER_CORE_FIELDS = [
	'archetype',
	'appearance'
] as const satisfies readonly (keyof DaydreamCharacter)[];

export type CharacterCoreField = (typeof CHARACTER_CORE_FIELDS)[number];

/**
 * Every character text the app knows by name: the core and the known field
 * kinds. What labels, chips and the suggestions' answers are keyed by.
 */
export type CharacterTextField = CharacterCoreField | CharacterFieldKind;

/**
 * A character written with one key per known text, as the catalog's starting
 * points and a model's answers are: easier to write, and turned into a
 * character with fields by `characterFromFlat`.
 */
export type FlatCharacter = Pick<DaydreamCharacter, 'name' | 'dials'> &
	Partial<Record<CharacterTextField, string>>;

/** A character from one written with a key per text, its known fields in their usual order. */
export function characterFromFlat(flat: FlatCharacter): DaydreamCharacter {
	return {
		name: flat.name,
		archetype: flat.archetype?.trim() ?? '',
		appearance: flat.appearance?.trim() ?? '',
		fields: fieldsFrom(CHARACTER_FIELD_KINDS, flat),
		dials: flat.dials
	};
}

/** The fields a new character starts with, to be filled in or removed. */
export const NEW_CHARACTER_FIELDS: readonly CharacterFieldKind[] = ['personality', 'speech'];

export const EMPTY_CHARACTER: DaydreamCharacter = {
	name: '',
	archetype: '',
	appearance: '',
	fields: NEW_CHARACTER_FIELDS.map((kind) => knownField(kind)),
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

/**
 * A place an idea's story can start (docs/daydreams.md, "Openings"): the same
 * idea from a different situation — the first night, three weeks in, the
 * morning after — so one idea gives several stories, from gentle to straight
 * in, without rewriting its premise. The opening passage is written from the
 * one chosen.
 */
export type IdeaOpening = {
	id: string;
	/** A few words, for the menu: "Three weeks in". */
	label: string;
	/** Where the story starts, in a sentence or two. */
	situation: string;
};

/** The most openings one idea has. */
export const MAX_OPENINGS = 4;

/**
 * What a tracker holds (docs/daydreams.md, "Trackers"): a meter from 0 to
 * 100, a whole-number count, a list of short items, or a line of text.
 */
export const TRACKER_KINDS = ['meter', 'count', 'list', 'text'] as const;

export type TrackerKind = (typeof TRACKER_KINDS)[number];

/**
 * Something the story keeps track of, shown to the user as it moves: a
 * submission meter, the days kept, a debt paid down, the rules in force.
 * Visible state that moves with the story is what holds the longest sessions
 * on the character-card sites.
 */
export type IdeaTracker = {
	id: string;
	name: string;
	kind: TrackerKind;
	/** Where it starts, as the user wrote it: "0", "3", "Kneel when spoken to". */
	start: string;
	/** What moves it, and what happens at either end, for the model. */
	about: string;
};

/** The most trackers one idea has. */
export const MAX_TRACKERS = 4;

export type DaydreamIdea = {
	title: string;
	/** What is going on as it starts. */
	premise: string;
	/** Who the user is in it, when they are in it: the user's own part. */
	yourRole: string;
	/** Everything else: where, the tone, notes or sayings… (`DaydreamField`). */
	fields: DaydreamField<IdeaFieldKind>[];
	/**
	 * What the user asked for, in their own words, when the idea was written
	 * from a brief on the new-daydream page. Kept as typed, beside the fields
	 * the model wrote from it, so the story model reads the request itself and
	 * not only a synthesis of it. Empty for an idea written by hand.
	 */
	brief: string;
	/**
	 * The model's own notes from writing the idea: what it found in the pages
	 * the brief linked, the themes and sayings there in their own words, and
	 * what it built on or left out. The fields are a summary; this is the
	 * material behind them, for the story model to draw on.
	 */
	research: string;
	/**
	 * The parts it has for characters. Optional: an idea with none is cast
	 * freely, and a part nobody is cast in is played by the story.
	 */
	parts: IdeaPart[];
	/** Where its story can start. None: it starts from the premise. */
	openings: IdeaOpening[];
	/** What the story keeps track of, shown as it moves. */
	trackers: IdeaTracker[];
	dials: IdeaDials;
};

/** The idea's own text besides its title and fields: what it is about, and the user's part. */
export const IDEA_CORE_FIELDS = [
	'premise',
	'yourRole'
] as const satisfies readonly (keyof DaydreamIdea)[];

export type IdeaCoreField = (typeof IDEA_CORE_FIELDS)[number];

/** Every idea text the app knows by name, besides its title: the core and the known field kinds. */
export type IdeaTextField = IdeaCoreField | IdeaFieldKind;

/**
 * An idea's texts written with one key per known text (`FlatCharacter`'s
 * counterpart), beside whatever else the idea carries.
 */
export type FlatIdeaTexts = { premise: string } & Partial<Record<IdeaTextField, string>>;

/**
 * An idea's texts as fields, from one written with a key per text, its known
 * fields in their usual order; whatever else it carries is kept as it is.
 */
export function ideaFromFlat<T extends FlatIdeaTexts>({
	premise,
	yourRole,
	setting,
	tone,
	notes,
	...rest
}: T): Omit<T, IdeaTextField> & Pick<DaydreamIdea, 'premise' | 'yourRole' | 'fields'> {
	return {
		...rest,
		premise: premise.trim(),
		yourRole: yourRole?.trim() ?? '',
		fields: fieldsFrom(IDEA_FIELD_KINDS, { setting, tone, notes })
	};
}

/** The fields a new idea starts with, to be filled in or removed. A monologue adds its sayings. */
export function newIdeaFields(narrator: DaydreamNarrator | undefined): readonly IdeaFieldKind[] {
	return narrator === 'monologue' ? ['notes', 'setting', 'tone'] : ['setting', 'tone'];
}

/**
 * Where an idea came from: the brief and the notes behind it. Text, but
 * never a field: fields are what the suggestions write in — Fill in the rest
 * inventing a brief the user never wrote, or research nobody did, would make
 * both worthless.
 */
export const IDEA_ORIGIN_FIELDS = [
	'brief',
	'research'
] as const satisfies readonly (keyof DaydreamIdea)[];

export type IdeaOriginField = (typeof IDEA_ORIGIN_FIELDS)[number];

/**
 * An idea with nowhere it came from: a ready-made one, or one a suggestion
 * wrote with no brief behind it. Whatever makes it a real idea gives it the
 * empty origin (`EMPTY_IDEA`'s), rather than every template spelling it out.
 */
export type IdeaWithoutOrigin = Omit<DaydreamIdea, IdeaOriginField>;

export const EMPTY_IDEA: DaydreamIdea = {
	title: '',
	premise: '',
	yourRole: '',
	fields: newIdeaFields(undefined).map((kind) => knownField(kind)),
	brief: '',
	research: '',
	parts: [],
	openings: [],
	trackers: [],
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

/**
 * Whether the characters' unspoken thoughts are on the page (docs/daydreams.md,
 * "Thoughts"): shown, set apart from what they say, or hidden, with the
 * camera kept outside every head.
 */
export type ThoughtsShown = 'shown' | 'hidden';

/** The story's sticky dials: sent with every reply until they are changed. */
export type StoryDials = {
	intensity: DialValue;
	pace: DialValue;
	length: PassageLength;
	thoughts: ThoughtsShown;
};

export const DEFAULT_STORY_DIALS: StoryDials = {
	intensity: 3,
	pace: 3,
	length: 'medium',
	thoughts: 'shown'
};

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
	/**
	 * The idea's opening the story starts from (`IdeaOpening.id`), or null for
	 * its premise. Only the first passage reads it; "Start somewhere else"
	 * picks another for a new beginning beside it.
	 */
	opening: string | null;
};

/** The opening chosen, if the idea still has it. */
export function chosenOpening(setup: Pick<DaydreamSetup, 'idea' | 'opening'>): IdeaOpening | null {
	return setup.idea.openings.find((opening) => opening.id === setup.opening) ?? null;
}

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
	/** A field the user named: its name (`DaydreamField.label`) and what it says. */
	fieldLabel: 40,
	customField: 1000,
	hides: 500,
	wontDo: 500,
	wonOver: 500,
	openingLabel: 60,
	openingSituation: 500,
	trackerName: 40,
	trackerStart: 200,
	trackerAbout: 300,
	/** A tracker's value: a list's items, or a text tracker's line. */
	trackerItem: 80,
	trackerText: 200,
	limits: 1000,
	/** The brief a daydream is written from on the new-daydream page: what the user typed. */
	brief: 500,
	/**
	 * An idea's research notes (`DaydreamIdea.research`): room for what a few
	 * linked pages said, word for word, since the sayings a brief linked are
	 * what a summary loses. At most around 3,000 tokens on every reply's system
	 * prompt. The model is asked for 1,000 characters under this
	 * (`RESEARCH_INSTRUCTION`), since a model told a length tends to run over it.
	 */
	ideaResearch: 11_000,
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
	 * prompt of around this; a usual one is a few thousand characters. Raised
	 * with `ideaResearch`, and no further than a passage at every cap still
	 * fits `daydreamTurnKind`'s ciphertext cap; past it, only the start is kept.
	 */
	sentSystem: 30_000,
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
	imagePrompt: 1000,
	/** A passage's line on how the story has moved on from its setup (`drifted`). */
	drifted: 200
} as const;

/** How long a field may be: its kind's own cap, or a field the user named's. */
export function fieldCap(kind: FieldKind | null, of: 'character' | 'idea'): number {
	switch (kind) {
		case 'personality':
		case 'speech':
		case 'likes':
		case 'hides':
		case 'wontDo':
		case 'wonOver':
		case 'setting':
		case 'tone':
			return DAYDREAM_LIMITS[kind];
		case 'notes':
			return of === 'character' ? DAYDREAM_LIMITS.characterNotes : DAYDREAM_LIMITS.ideaNotes;
		case null:
			return DAYDREAM_LIMITS.customField;
		default:
			return assertNever(kind, 'field kind');
	}
}

/** The longest any field may be, whatever its kind. */
export const MAX_FIELD_LENGTH = Math.max(
	...[...CHARACTER_FIELD_KINDS, null].map((kind) => fieldCap(kind, 'character')),
	...[...IDEA_FIELD_KINDS, null].map((kind) => fieldCap(kind, 'idea'))
);

/**
 * A tracker's value as the story holds it: a meter's or count's number, a
 * list's items, or a line of text.
 */
export type TrackerValue = number | string | string[];

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
