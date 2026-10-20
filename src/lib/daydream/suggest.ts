/**
 * Asking the model for suggestions while setting up, and reading what comes
 * back. BROWSER ONLY: it goes through `client.ts`.
 *
 * Each answers either the checked suggestion or words for why there is none;
 * a suggestion is a convenience, so a failure is shown where it was asked
 * for and nothing else changes.
 */

import type {
	CharacterDials,
	DaydreamCharacter,
	DaydreamIdea,
	DaydreamNarrator,
	DaydreamStance,
	DaydreamVoicePresetId,
	IdeaDials,
	IdeaPart,
	StoryDials
} from '../daydream';
import { requestSuggestion } from './client';
import type { DaydreamPieces, StarterSide } from './starters';
import {
	completionJson,
	describeUnusable,
	type GeneratedIdea,
	parseCasting,
	parseChips,
	parseFill,
	parseGeneratedIdeas,
	parseIdeaDials,
	parseName,
	parseParts,
	parseSuggestedDaydream,
	parseSurpriseIdea,
	type SuggestedPart,
	type SuggestTarget
} from './suggestions';

/** What the model is told about the daydream around the thing being written. */
export type SuggestContext = {
	characters: { name: string; archetype: string }[];
	limits: string;
	story?: StoryDials;
	/** How it is told, when there is a daydream around it: a monologue's idea is a different shape. */
	narrator?: DaydreamNarrator;
};

/**
 * Why a suggestion failed: words for the person who asked, and for debug mode
 * what came back, when the model answered with nothing usable
 * (`SuggestionProblem.svelte`).
 */
export type SuggestFailure = { error: string; detail?: string };

type Answer<T> = { ok: true; value: T } | ({ ok: false } & SuggestFailure);

const NOTHING = 'No ideas came back that time. Try again.';

/** The model's answer: the JSON in its reply, and the answer as it came, to describe if it is no use. */
async function ask(
	body: unknown
): Promise<{ ok: true; value: unknown; body: unknown } | ({ ok: false } & SuggestFailure)> {
	const answer = await requestSuggestion(body);
	return answer.ok ? { ok: true, value: completionJson(answer.value), body: answer.value } : answer;
}

/** "No ideas came back", with what did come back for debug mode. */
const nothing = (answer: { body: unknown }): { ok: false } & SuggestFailure => ({
	ok: false,
	error: NOTHING,
	detail: describeUnusable(answer.body)
});

/** An idea's parts as a suggestion is told them: no ids, which mean nothing to the model. */
type PartsDraft = Pick<IdeaPart, 'name' | 'description'>[];

/** The request's draft: the fields, and an idea's parts inside it, as the endpoint takes them. */
const withParts = ({ parts, ...input }: { draft: Record<string, string>; parts?: PartsDraft }) => ({
	...input,
	draft: parts ? { ...input.draft, parts } : input.draft
});

export async function suggestChips(input: {
	target: SuggestTarget;
	field: string;
	draft: Record<string, string>;
	parts?: PartsDraft;
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
 * What "Fill in the rest" came back with: text for empty fields, and for an
 * idea its parts when it had none and its heat and kink where they were unset.
 */
export type Filled = {
	fields: Partial<Record<string, string>>;
	parts: SuggestedPart[];
	ideaDials: IdeaDials;
};

export async function suggestFill(input: {
	target: SuggestTarget;
	draft: Record<string, string>;
	parts?: PartsDraft;
	dials?: CharacterDials;
	ideaDials?: IdeaDials;
	context: SuggestContext;
}): Promise<Answer<Filled>> {
	const answer = await ask({ task: 'fill', ...withParts(input) });
	if (!answer.ok) {
		return answer;
	}
	const fields = parseFill(input.target, answer.value);
	const parts = input.target === 'idea' ? parseParts(answer.value) : [];
	const ideaDials =
		input.target === 'idea' ? parseIdeaDials(answer.value) : { heat: null, kink: null };
	return Object.keys(fields).length > 0 || parts.length > 0
		? { ok: true, value: { fields, parts, ideaDials } }
		: nothing(answer);
}

/** Who a character is in this story, written from them and the idea. */
export async function suggestCasting(input: {
	character: Omit<DaydreamCharacter, 'dials'>;
	idea: Pick<DaydreamIdea, 'title' | 'setting' | 'premise' | 'yourRole' | 'tone'>;
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

/** A name for a daydream, from its idea and how it opened. */
export async function suggestName(input: {
	idea: Pick<DaydreamIdea, 'title' | 'premise'>;
	characters: string[];
	opening: string;
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
): Promise<Answer<Omit<DaydreamIdea, 'parts'> & { parts: SuggestedPart[] }>> {
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
export async function suggestDaydream(input: {
	brief: string;
	/** The side chosen, or a generated idea was made for, so the whole daydream keeps the user on it. */
	side?: StarterSide | null;
	/** The voice a generated idea was made for, so the daydream is told that way. */
	voice?: DaydreamVoicePresetId | null;
	limits: string;
}): Promise<Answer<DaydreamPieces>> {
	const answer = await ask({ task: 'daydream', ...input });
	if (!answer.ok) {
		return answer;
	}
	const pieces = parseSuggestedDaydream(answer.value);
	return pieces ? { ok: true, value: pieces } : nothing(answer);
}

/**
 * A few ideas for daydreams of the kind the user asked for, for the side
 * they chose under "You as" (null for either). Ideas only — a title, a
 * premise, tags, a voice, a level — so asking for a handful stays quick; the one picked is then
 * written out by `suggestDaydream`. With `offered`, they are more of the
 * same, other than those.
 */
export async function suggestIdeas(input: {
	brief: string;
	side: StarterSide | null;
	limits: string;
	/** Titles already shown, for "More ideas" not to offer them again. */
	offered?: readonly string[];
}): Promise<Answer<GeneratedIdea[]>> {
	const answer = await ask({ task: 'ideas', ...input });
	if (!answer.ok) {
		return answer;
	}
	const ideas = parseGeneratedIdeas(answer.value, input.side);
	return ideas.length > 0 ? { ok: true, value: ideas } : nothing(answer);
}
