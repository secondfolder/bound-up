/**
 * Asking the model for suggestions while setting up, and reading what comes
 * back. BROWSER ONLY: it goes through `client.ts`.
 *
 * Each answers either the checked suggestion or words for why there is none;
 * a suggestion is a convenience, so a failure is shown where it was asked
 * for and nothing else changes.
 */

import {
	type CharacterDials,
	type CharacterFieldKind,
	type DaydreamCharacter,
	type DaydreamIdea,
	type DaydreamNarrator,
	type DaydreamStance,
	type DaydreamVoicePresetId,
	type IdeaDials,
	type IdeaFieldKind,
	type IdeaPart,
	knownValues,
	namedFields,
	type StoryDials
} from '../daydream';
import { requestSuggestion, type SuggestionWatch } from './client';
import { type ExchangeLogView, suggestionLog } from './exchange-log';
import { type SetupExchange, type SetupExchangeTask, setupExchangeFrom } from './setup-exchange';
import type { DaydreamPieces, StarterSide } from './starters';
import {
	type CatchUp,
	completionJson,
	describeUnusable,
	type GeneratedIdea,
	parseCasting,
	parseCatchUp,
	parseChips,
	parseFill,
	parseGeneratedIdeas,
	parseIdeaDials,
	parseName,
	parseNewFields,
	parseOpenings,
	parseParts,
	parseSuggestedDaydream,
	parseSurpriseIdea,
	parseTrackers,
	type SuggestedField,
	type SuggestedIdea,
	type SuggestedOpening,
	type SuggestedPart,
	type SuggestedTracker,
	type SuggestTarget
} from './suggestions';

/** What the model is told about the daydream around the thing being written. */
export type SuggestContext = {
	characters: { name: string; archetype: string }[];
	limits: string;
	story?: StoryDials;
	/** How it is told, when there is a daydream around it: a monologue's idea is a different shape. */
	narrator?: DaydreamNarrator;
	/** The idea's heat and kink, so a character is written as sexual as the daydream is set to be. */
	ideaDials?: IdeaDials;
};

/**
 * Why a suggestion failed: words for the person who asked, and for debug mode
 * what came back, when the model answered with nothing usable
 * (`SuggestionProblem.svelte`).
 */
export type SuggestFailure = {
	error: string;
	detail?: string;
	/** The whole exchange, links read and all, for debug mode, when the request asked for it. */
	log?: ExchangeLogView;
};

type Answer<T> = { ok: true; value: T } | ({ ok: false } & SuggestFailure);

const NOTHING = 'No ideas came back that time. Try again.';

/** When a request was sent and its answer arrived, for a setup exchange. */
type Timing = { startedAt: number; endedAt: number };

/**
 * The model's answer: the JSON in its reply, the answer as it came, to
 * describe if it is no use, and when it was asked and answered. `watch` is
 * told how it is going meanwhile (`SuggestionWatch`); the long ones — a whole
 * daydream, ideas, catching the idea up — take one, for the page to show
 * progress while it waits (`ModelProgress.svelte`).
 */
async function ask(
	body: object,
	watch: SuggestionWatch = {}
): Promise<
	{ ok: true; value: unknown; body: unknown; timing: Timing } | ({ ok: false } & SuggestFailure)
> {
	const startedAt = Date.now();
	const answer = await requestSuggestion(body, watch);
	return answer.ok
		? {
				ok: true,
				value: completionJson(answer.value),
				body: answer.value,
				timing: { startedAt, endedAt: Date.now() }
			}
		: answer;
}

/** "No ideas came back", with what did come back for debug mode. */
const nothing = (answer: { body: unknown }): { ok: false } & SuggestFailure => ({
	ok: false,
	error: NOTHING,
	detail: describeUnusable(answer.body)
});

/** An idea's parts as a suggestion is told them: no ids, which mean nothing to the model. */
type PartsDraft = Pick<IdeaPart, 'name' | 'description'>[];

/** A field the record's user named, as a suggestion is told it (`namedFields`). */
type NamedFieldDraft = Pick<SuggestedField, 'label' | 'value' | 'spoiler'>;

/**
 * The request's draft as the endpoint takes it: the core and known fields by
 * name, and inside it an idea's parts and the fields the user named.
 */
const withParts = ({
	parts,
	named,
	...input
}: {
	draft: Record<string, string>;
	parts?: PartsDraft;
	named?: NamedFieldDraft[];
}) => ({
	...input,
	draft: {
		...input.draft,
		...(parts ? { parts } : {}),
		...(named && named.length > 0 ? { fields: named } : {})
	}
});

/**
 * Chips for one field: a core or known one by name (`field`), or one the user
 * named, by its name (`label`, with `field` 'named').
 */
export async function suggestChips(input: {
	target: SuggestTarget;
	field: string;
	label?: string;
	draft: Record<string, string>;
	parts?: PartsDraft;
	named?: NamedFieldDraft[];
	dials?: CharacterDials;
	ideaDials?: IdeaDials;
	context: SuggestContext;
}): Promise<Answer<string[]>> {
	const answer = await ask({ task: 'chips', ...withParts(input) });
	if (!answer.ok) {
		return answer;
	}
	const chips = parseChips(answer.value);
	return chips.length > 0 ? { ok: true, value: chips } : nothing(answer);
}

/**
 * What "Fill in the rest" came back with: text for empty fields by name,
 * fields it named for the record (`named`), and for an idea its parts,
 * openings and trackers when it had none, and its heat and kink where they
 * were unset.
 */
export type Filled = {
	fields: Partial<Record<string, string>>;
	named: SuggestedField[];
	parts: SuggestedPart[];
	openings: SuggestedOpening[];
	trackers: SuggestedTracker[];
	ideaDials: IdeaDials;
};

export async function suggestFill(input: {
	target: SuggestTarget;
	draft: Record<string, string>;
	parts?: PartsDraft;
	named?: NamedFieldDraft[];
	dials?: CharacterDials;
	ideaDials?: IdeaDials;
	context: SuggestContext;
}): Promise<Answer<Filled>> {
	const answer = await ask({ task: 'fill', ...withParts(input) });
	if (!answer.ok) {
		return answer;
	}
	const idea = input.target === 'idea';
	const value: Filled = {
		fields: parseFill(input.target, answer.value),
		named: parseNewFields(answer.value),
		parts: idea ? parseParts(answer.value) : [],
		openings: idea ? parseOpenings(answer.value) : [],
		trackers: idea ? parseTrackers(answer.value) : [],
		ideaDials: idea ? parseIdeaDials(answer.value) : { heat: null, kink: null }
	};
	return Object.keys(value.fields).length > 0 ||
		value.named.length > 0 ||
		value.parts.length > 0 ||
		value.openings.length > 0 ||
		value.trackers.length > 0
		? { ok: true, value }
		: nothing(answer);
}

/**
 * A character as a suggestion is told them: their core and known fields by
 * name, and the fields their user named.
 */
export type CharacterDraft = Pick<DaydreamCharacter, 'name' | 'archetype' | 'appearance'> &
	Partial<Record<CharacterFieldKind, string>> & { fields?: NamedFieldDraft[] };

/** An idea as a suggestion is told it, by name (`CharacterDraft`'s counterpart). */
export type IdeaDraft = Pick<DaydreamIdea, 'title' | 'premise' | 'yourRole'> &
	Partial<Record<IdeaFieldKind, string>> & { fields?: NamedFieldDraft[] };

/** A character as a suggestion is told them (`CharacterDraft`). */
export function characterDraft(character: Omit<DaydreamCharacter, 'dials'>): CharacterDraft {
	const named = namedFields(character.fields);
	return {
		name: character.name,
		archetype: character.archetype,
		appearance: character.appearance,
		...knownValues(character.fields),
		...(named.length > 0 ? { fields: named } : {})
	};
}

/** An idea as a suggestion is told it (`IdeaDraft`). */
export function ideaDraft(idea: Pick<DaydreamIdea, 'title' | 'premise' | 'yourRole' | 'fields'>) {
	const named = namedFields(idea.fields);
	return {
		title: idea.title,
		premise: idea.premise,
		yourRole: idea.yourRole,
		...knownValues(idea.fields),
		...(named.length > 0 ? { fields: named } : {})
	} satisfies IdeaDraft;
}

/** Who a character is in this story, written from them and the idea. */
export async function suggestCasting(input: {
	character: CharacterDraft;
	idea: IdeaDraft;
	ideaDials?: IdeaDials;
	part: Pick<IdeaPart, 'name' | 'description'> | null;
	others: { name: string; part: string | null }[];
	stance: DaydreamStance;
	limits: string;
}): Promise<Answer<{ relationship: string; part: string }>> {
	const answer = await ask({ task: 'casting', ...input });
	if (!answer.ok) {
		return answer;
	}
	const casting = parseCasting(answer.value);
	return casting ? { ok: true, value: casting } : nothing(answer);
}

/**
 * "Update the idea": the setup's fields brought up to date with the story,
 * only those that changed (`parseCatchUp`), or why there are none.
 */
export async function suggestCatchUp(
	input: {
		idea: Pick<DaydreamIdea, 'title' | 'premise' | 'yourRole'> &
			Record<'setting' | 'tone' | 'notes', string>;
		narrator: DaydreamNarrator;
		characters: { name: string; personality: string; relationship: string; doing: string }[];
		story: string[];
		drifted: string;
		limits: string;
	},
	watch?: SuggestionWatch
): Promise<Answer<CatchUp>> {
	const answer = await ask({ task: 'catch-up', ...input }, watch);
	if (!answer.ok) {
		return answer;
	}
	const proposed = parseCatchUp(answer.value, input);
	return proposed ? { ok: true, value: proposed } : nothing(answer);
}

/** A name for a daydream, from its idea and how it opened. */
export async function suggestName(input: {
	idea: Pick<DaydreamIdea, 'title' | 'premise'>;
	ideaDials?: IdeaDials;
	characters: string[];
	opening: string;
	/** The titles of other daydreams from the same idea, for this one not to repeat. */
	taken?: string[];
	limits: string;
}): Promise<Answer<string>> {
	const answer = await ask({ task: 'name', ...input });
	if (!answer.ok) {
		return answer;
	}
	const name = parseName(answer.value);
	return name ? { ok: true, value: name } : nothing(answer);
}

/** A whole idea, made up. `ideaDials` are any heat and kink already chosen, for it to fit. */
export async function surpriseIdea(
	context: SuggestContext,
	ideaDials?: IdeaDials
): Promise<Answer<SuggestedIdea>> {
	const answer = await ask({
		task: 'surprise-idea',
		target: 'idea',
		draft: {},
		...(ideaDials ? { ideaDials } : {}),
		context
	});
	if (!answer.ok) {
		return answer;
	}
	const idea = parseSurpriseIdea(answer.value);
	return idea ? { ok: true, value: idea } : nothing(answer);
}

/**
 * A whole daydream, from a brief the user wrote ("a stranger on a night
 * train", "the things a good girl says"): its voice, its idea and who is in
 * it, for `assembleSetup` to put together.
 */
export async function suggestDaydream(
	input: {
		brief: string;
		/** The side chosen, or a generated idea was made for, so the whole daydream keeps the user on it. */
		side?: StarterSide | null;
		/** The voice a generated idea was made for, so the daydream is told that way. */
		voice?: DaydreamVoicePresetId | null;
		/** The generated idea picked, when it is one; `brief` is then what the ideas were asked for with. */
		chosen?: { title: string; premise: string };
		/** The research the generated ideas were written with, to build on rather than read again. */
		research?: string;
		limits: string;
		/** Debug mode is on: ask for what was sent too, for the chat log (`suggestionLog`). */
		debugLog?: boolean;
	},
	watch?: SuggestionWatch
): Promise<WithLog<DaydreamPieces>> {
	const answer = await ask({ task: 'daydream', ...input }, watch);
	if (!answer.ok) {
		return answer;
	}
	const pieces = parseSuggestedDaydream(answer.value);
	return withLog(
		'daydream',
		answer,
		pieces
			? {
					ok: true,
					value: {
						...pieces,
						idea: {
							...pieces.idea,
							// What the user typed, kept as they typed it: the model's
							// version of it is everything else in the idea.
							brief: input.brief.trim(),
							// A model that forgot its notes still leaves the earlier ones.
							research: pieces.idea.research || input.research?.trim() || ''
						}
					}
				}
			: nothing(answer)
	);
}

/**
 * What a suggestion that took a brief came back with, and the whole exchange
 * where the request asked for it (`suggestionLog`), for debug mode to show
 * either way: the links it read are in it, and a link that could not be read
 * is half of why ideas can come back thin. `exchange` is the same exchange
 * as it is kept, for a daydream made from it to keep (`setup-exchange.ts`).
 */
export type WithLog<T> = Answer<T> & { log?: ExchangeLogView; exchange?: SetupExchange };

function withLog<T>(
	task: SetupExchangeTask,
	answer: { body: unknown; timing: Timing },
	result: Answer<T>
): WithLog<T> {
	const log = suggestionLog(answer.body);
	const exchange = log ? setupExchangeFrom(task, answer.body, answer.timing) : null;
	return log && exchange ? { ...result, log, exchange } : result;
}

/**
 * A few ideas for daydreams of the kind the user asked for, for the side
 * they chose under "You as" (null for either). Ideas only — a title, a
 * premise, tags, a voice, a level — so asking for a handful stays quick; the one picked is then
 * written out by `suggestDaydream`. With `offered`, they are more of the
 * same, other than those.
 */
export async function suggestIdeas(
	input: {
		brief: string;
		side: StarterSide | null;
		limits: string;
		/** Titles already shown, for "More ideas" not to offer them again. */
		offered?: readonly string[];
		/** Debug mode is on: ask for what was sent too, for the chat log (`suggestionLog`). */
		debugLog?: boolean;
	},
	watch?: SuggestionWatch
): Promise<WithLog<GeneratedIdea[]>> {
	const answer = await ask({ task: 'ideas', ...input }, watch);
	if (!answer.ok) {
		return answer;
	}
	const ideas = parseGeneratedIdeas(answer.value, input.side);
	return withLog('ideas', answer, ideas.length > 0 ? { ok: true, value: ideas } : nothing(answer));
}
