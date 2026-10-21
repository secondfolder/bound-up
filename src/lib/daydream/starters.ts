/**
 * Whole daydreams to start from: the ready-made daydreams on the new-daydream
 * page, and the assembly that turns a daydream described in pieces — by one of
 * those, or by the model from a sentence the user wrote — into a setup the
 * form can open.
 *
 * Ready-made daydreams are built from the starting points in `catalog.ts`
 * rather than written out again: an idea template, a voice, and character
 * templates cast into the idea's parts, with who they are in this daydream
 * written here, since that depends on the daydream (docs/daydreams.md,
 * "Characters, ideas and casting"). Like the rest of the catalog they run
 * the whole range, in order of heat, and say their level.
 *
 * Pure and alias-free.
 */

import {
	DAYDREAM_VOICE_PRESETS,
	type DaydreamCharacter,
	type DaydreamIdea,
	type DaydreamSetup,
	type DaydreamVoicePresetId,
	DEFAULT_PICTURES,
	DEFAULT_STORY_DIALS,
	EMPTY_CASTING,
	type IdeaOpening,
	type IdeaOriginField,
	type IdeaTracker,
	type IdeaWithoutOrigin,
	inferVoice,
	MAX_DAYDREAM_CHARACTERS,
	voiceProblem
} from '../daydream';
import { CHARACTER_TEMPLATES, IDEA_TEMPLATES } from './catalog';
import { PRESET_STARTERS } from './presets';
import type { DaydreamStarter, StarterSide } from './presets/types';
import type { SuggestedPart } from './suggestions';
import { type MarkedSummary, parseMarkedSummary } from './summary';

/** One person in a daydream described in pieces, and who they are in it. */
export type DaydreamCast = {
	character: DaydreamCharacter;
	/** The name of the idea's part they play, or null for none in particular. */
	partName: string | null;
	relationship: string;
	/** What they are doing, or want, as it starts: the casting's `part`. */
	doing: string;
};

/** A daydream described in pieces, before it has ids or a voice that is sure to work. */
export type DaydreamPieces = {
	/** Null to have it follow who is in it (`inferVoice`). */
	voice: DaydreamVoicePresetId | null;
	/**
	 * Its brief and research only when it was written from a brief: empty
	 * otherwise. Its parts, openings and trackers have no ids yet.
	 */
	idea: Omit<IdeaWithoutOrigin, 'parts' | 'openings' | 'trackers'> &
		Partial<Pick<DaydreamIdea, IdeaOriginField>> & {
			parts: readonly SuggestedPart[];
			openings?: readonly Omit<IdeaOpening, 'id'>[];
			trackers?: readonly Omit<IdeaTracker, 'id'>[];
		};
	cast: readonly DaydreamCast[];
	/**
	 * The model's summary of it, with its blanks marked; none for a
	 * ready-made daydream, whose premise is shown instead. Only for showing the
	 * draft: it is not part of the setup.
	 */
	summary?: MarkedSummary | null;
};

/**
 * A setup from a daydream in pieces. Parts get fresh ids, each person is cast
 * into the part named for them if it is still free (by name, ignoring case),
 * and a voice that cannot work with who is in it — watching nobody, say —
 * gives way to the one that follows them. Nothing is from the library, so
 * every copy is one with no source.
 */
export function assembleSetup(
	pieces: DaydreamPieces,
	newId: () => string = () => crypto.randomUUID()
): DaydreamSetup {
	const parts = pieces.idea.parts.map((part) => ({ ...part, id: newId() }));
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
		idea: {
			...pieces.idea,
			brief: pieces.idea.brief ?? '',
			research: pieces.idea.research ?? '',
			parts,
			openings: (pieces.idea.openings ?? []).map((opening) => ({ ...opening, id: newId() })),
			trackers: (pieces.idea.trackers ?? []).map((tracker) => ({ ...tracker, id: newId() })),
			sourceId: null,
			sourceRevision: null
		},
		lead: 'character',
		limits: '',
		dials: DEFAULT_STORY_DIALS,
		pictures: DEFAULT_PICTURES,
		opening: null
	};
}

// ── ready-made daydreams ───────────────────────────────────────────────────────

export type { DaydreamStarter, StarterSide } from './presets/types';

/**
 * Ready-made daydreams, in the ideas' order: by heat, the one SFW slow burn
 * first. Written in `presets/`, a module per theme.
 */
export const DAYDREAM_STARTERS: readonly DaydreamStarter[] = [...PRESET_STARTERS].sort(
	(a, b) =>
		IDEA_TEMPLATES.findIndex((template) => template.id === a.idea) -
		IDEA_TEMPLATES.findIndex((template) => template.id === b.idea)
);

/**
 * The ready-made daydreams for one side, or all of them for null ("Either"). A
 * daydream with no one in charge suits both sides, so it is never filtered out.
 */
export function startersFor(side: StarterSide | null): readonly DaydreamStarter[] {
	return forSide(DAYDREAM_STARTERS, side);
}

/**
 * The ready-made daydreams' ids in a fresh order, so the start page does not
 * open on the same few every time. Drawn by the page's load, not the
 * component: drawn during render, the server and the browser would each
 * draw their own and hydration would disagree with what was shown.
 */
export function shuffledStarterIds(random: () => number = Math.random): string[] {
	const ids = DAYDREAM_STARTERS.map((starter) => starter.id);
	for (let at = ids.length - 1; at > 0; at -= 1) {
		const other = Math.floor(random() * (at + 1));
		[ids[at], ids[other]] = [ids[other] as string, ids[at] as string];
	}
	return ids;
}

/**
 * How many ready-made daydreams the start page shows before "More ideas" shows
 * the rest: a handful to choose from rather than a catalogue to read through,
 * and as many as one round of suggested ones (`GENERATED_IDEAS`).
 */
export const SHOWN_STARTERS = 6;

/** The daydreams in `order` (ids), any it does not name after the rest. */
export function inOrder<T extends { id: string }>(
	items: readonly T[],
	order: readonly string[]
): T[] {
	const at = (item: T) => {
		const found = order.indexOf(item.id);
		return found === -1 ? order.length : found;
	};
	return [...items].sort((a, b) => at(a) - at(b));
}

/** `startersFor`'s rule for anything with a `you`: the generated ideas are filtered by it too. */
export function forSide<T extends { you: StarterSide | null }>(
	items: readonly T[],
	side: StarterSide | null
): readonly T[] {
	return side === null ? items : items.filter((item) => item.you === null || item.you === side);
}

/** What a daydream card says, for the start page's search to look through. */
export type SearchableDaydream = { title: string; premise: string; tags: readonly string[] };

/**
 * Whether a daydream card matches what was typed in the start page's search:
 * every word somewhere in its title, premise or tags, ignoring case, so
 * "brat office" finds a daydream tagged "brat" set in an office. Nothing
 * typed matches everything.
 */
const WORDS = /\s+/;

export function matchesSearch(item: SearchableDaydream, query: string): boolean {
	const words = query.toLocaleLowerCase().split(WORDS).filter(Boolean);
	const text = [item.title, item.premise, ...item.tags].join('\n').toLocaleLowerCase();
	return words.every((word) => text.includes(word));
}

/**
 * The side the start page remembers on the device, read back from storage.
 * Anything else — nothing stored, "Either", or a value from some other
 * version — is null, which shows every daydream.
 */
export function storedStarterSide(stored: string | null): StarterSide | null {
	return stored === 'dom' || stored === 'sub' ? stored : null;
}

/** The idea template a starter is built on. Throws for a starter that names one that is not there. */
export function starterIdea(starter: DaydreamStarter) {
	const template = IDEA_TEMPLATES.find((entry) => entry.id === starter.idea);
	if (!template) {
		throw new Error(`The "${starter.id}" starter names an idea template that does not exist`);
	}
	return template;
}

/** A ready-made daydream as a setup. Throws for one naming a template that is not there. */
export function starterSetup(starter: DaydreamStarter, newId?: () => string): DaydreamSetup {
	const cast = starter.cast.map(({ character, part, relationship, doing }) => {
		const template = CHARACTER_TEMPLATES.find((entry) => entry.id === character);
		if (!template) {
			throw new Error(`The "${starter.id}" starter names a character template that does not exist`);
		}
		return { character: template.character, partName: part, relationship, doing };
	});
	return assembleSetup({ voice: starter.voice, idea: starterIdea(starter).idea, cast }, newId);
}

/** A ready-made daydream's summary, read against the setup it makes (`starterSetup`). */
export function starterSummary(
	starter: DaydreamStarter,
	setup: Pick<DaydreamSetup, 'characters'>
): MarkedSummary | null {
	return parseMarkedSummary(
		starter.summary,
		setup.characters.map((character) => character.name)
	);
}
