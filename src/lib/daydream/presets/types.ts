import type {
	CharacterFieldKind,
	DaydreamVoicePresetId,
	FlatCharacter,
	IdeaFieldKind,
	IdeaOpening,
	IdeaPart,
	IdeaTracker,
	IdeaWithoutOrigin
} from '../../daydream';

/** What an idea's parts, openings and trackers are before they have ids. */
export type WithoutId<T> = Omit<T, 'id'>;

/**
 * A field a starting point names itself (docs/daydreams.md, "Fields"): a
 * twist kept for play, a rule of the house, what scares them. Given a fixed
 * id from its template and label (`ownFieldId` in `catalog.ts`).
 */
export type OwnField = { label: string; value: string; spoiler?: boolean };

/**
 * What a starting point adds to the known fields a flat record has: which
 * of them are spoilers, and fields of its own.
 */
export type FieldExtras<Kind> = {
	spoilers?: readonly Kind[];
	own?: readonly OwnField[];
};

/** A character starting point, written with a key per text (`characterFromFlat`). */
export type CharacterTemplateText = {
	id: string;
	label: string;
	character: FlatCharacter & FieldExtras<CharacterFieldKind>;
};

/** An idea starting point's texts, a key per text (`ideaFromFlat`). */
export type IdeaTemplateTexts = {
	title: string;
	premise: string;
	setting?: string;
	yourRole?: string;
	tone?: string;
	notes?: string;
	parts: WithoutId<IdeaPart>[];
	openings?: WithoutId<IdeaOpening>[];
	trackers?: WithoutId<IdeaTracker>[];
	dials: IdeaWithoutOrigin['dials'];
} & FieldExtras<IdeaFieldKind>;

export type IdeaTemplateText = { id: string; label: string; idea: IdeaTemplateTexts };

/** The user's side in a ready-made daydream. */
export type StarterSide = 'dom' | 'sub';

export type DaydreamStarter = {
	id: string;
	/**
	 * Which side the user is on: the dom, the sub, or null for a daydream with
	 * no one in charge. The start page's "You as" filter goes by it.
	 */
	you: StarterSide | null;
	/** Its kinks and tropes, a word or two each, shown on its card so it can be picked at a glance. */
	tags: readonly string[];
	voice: DaydreamVoicePresetId;
	/** An `IDEA_TEMPLATES` id. */
	idea: string;
	/**
	 * What the setup form shows it as, written like the model's summary of a
	 * daydream it put together (`parseMarkedSummary`): the first mention of
	 * the idea, the heat, how it is told, each character, and, for an idea
	 * with openings, where it starts, marked as `[[key|words]]`, each
	 * character by their template's name.
	 */
	summary: string;
	cast: readonly {
		/** A `CHARACTER_TEMPLATES` id. */
		character: string;
		/** The name of the idea template's part they play. */
		part: string;
		relationship: string;
		doing: string;
	}[];
};

/**
 * One theme's starting points: its own characters (beside the shared ones in
 * `characters.ts`), its ideas, and the ready-made daydreams built from them.
 */
export type PresetModule = {
	characters: readonly CharacterTemplateText[];
	ideas: readonly IdeaTemplateText[];
	starters: readonly DaydreamStarter[];
};
