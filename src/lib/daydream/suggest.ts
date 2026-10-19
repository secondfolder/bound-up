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
	DaydreamScene,
	DaydreamStance,
	SceneDials,
	ScenePart,
	StoryDials
} from '../daydream';
import { requestSuggestion } from './client';
import type { StarterSide, StoryPieces } from './starters';
import {
	completionJson,
	type GeneratedIdea,
	parseCasting,
	parseChips,
	parseFill,
	parseGeneratedIdeas,
	parseName,
	parseParts,
	parseSceneDials,
	parseSuggestedDaydream,
	parseSurpriseScene,
	type SuggestedPart,
	type SuggestTarget
} from './suggestions';

/** What the model is told about the daydream around the thing being written. */
export type SuggestContext = {
	characters: { name: string; archetype: string }[];
	limits: string;
	story?: StoryDials;
};

type Answer<T> = { ok: true; value: T } | { ok: false; error: string };

const NOTHING = 'No ideas came back that time. Try again.';

async function ask(body: unknown): Promise<Answer<unknown>> {
	const answer = await requestSuggestion(body);
	return answer.ok ? { ok: true, value: completionJson(answer.value) } : answer;
}

/** A scene's parts as a suggestion is told them: no ids, which mean nothing to the model. */
type PartsDraft = Pick<ScenePart, 'name' | 'description'>[];

/** The request's draft: the fields, and a scene's parts inside it, as the endpoint takes them. */
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
	sceneDials?: SceneDials;
	context: SuggestContext;
}): Promise<Answer<string[]>> {
	const answer = await ask({ task: 'chips', ...withParts(input) });
	if (!answer.ok) {
		return answer;
	}
	const chips = parseChips(answer.value);
	return chips.length > 0 ? { ok: true, value: chips } : { ok: false, error: NOTHING };
}

/**
 * What "Fill in the rest" came back with: text for empty fields, and for a
 * scene its parts when it had none and its heat and kink where they were unset.
 */
export type Filled = {
	fields: Partial<Record<string, string>>;
	parts: SuggestedPart[];
	sceneDials: SceneDials;
};

export async function suggestFill(input: {
	target: SuggestTarget;
	draft: Record<string, string>;
	parts?: PartsDraft;
	dials?: CharacterDials;
	sceneDials?: SceneDials;
	context: SuggestContext;
}): Promise<Answer<Filled>> {
	const answer = await ask({ task: 'fill', ...withParts(input) });
	if (!answer.ok) {
		return answer;
	}
	const fields = parseFill(input.target, answer.value);
	const parts = input.target === 'scene' ? parseParts(answer.value) : [];
	const sceneDials =
		input.target === 'scene' ? parseSceneDials(answer.value) : { heat: null, kink: null };
	return Object.keys(fields).length > 0 || parts.length > 0
		? { ok: true, value: { fields, parts, sceneDials } }
		: { ok: false, error: NOTHING };
}

/** Who a character is in this story, written from them and the scene. */
export async function suggestCasting(input: {
	character: Omit<DaydreamCharacter, 'dials'>;
	scene: Pick<DaydreamScene, 'title' | 'setting' | 'premise' | 'yourRole' | 'tone'>;
	part: Pick<ScenePart, 'name' | 'description'> | null;
	others: { name: string; part: string | null }[];
	stance: DaydreamStance;
	limits: string;
}): Promise<Answer<{ relationship: string; part: string }>> {
	const answer = await ask({ task: 'casting', ...input });
	if (!answer.ok) {
		return answer;
	}
	const casting = parseCasting(answer.value);
	return casting ? { ok: true, value: casting } : { ok: false, error: NOTHING };
}

/** A name for a daydream, from its scene and how it opened. */
export async function suggestName(input: {
	scene: Pick<DaydreamScene, 'title' | 'premise'>;
	characters: string[];
	opening: string;
	limits: string;
}): Promise<Answer<string>> {
	const answer = await ask({ task: 'name', ...input });
	if (!answer.ok) {
		return answer;
	}
	const name = parseName(answer.value);
	return name ? { ok: true, value: name } : { ok: false, error: NOTHING };
}

/** A whole scene, made up. `sceneDials` are any heat and kink already chosen, for it to fit. */
export async function surpriseScene(
	context: SuggestContext,
	sceneDials?: SceneDials
): Promise<Answer<Omit<DaydreamScene, 'parts'> & { parts: SuggestedPart[] }>> {
	const answer = await ask({
		task: 'surprise-scene',
		target: 'scene',
		draft: {},
		...(sceneDials ? { sceneDials } : {}),
		context
	});
	if (!answer.ok) {
		return answer;
	}
	const scene = parseSurpriseScene(answer.value);
	return scene ? { ok: true, value: scene } : { ok: false, error: NOTHING };
}

/**
 * A whole daydream, from a sentence the user wrote ("a stranger on a night
 * train"): its voice, its scene and who is in it, for `assembleSetup` to put
 * together.
 */
export async function suggestDaydream(input: {
	idea: string;
	/** The side a generated idea was made for, so the whole daydream keeps the user on it. */
	side?: StarterSide | null;
	limits: string;
}): Promise<Answer<StoryPieces>> {
	const answer = await ask({ task: 'daydream', ...input });
	if (!answer.ok) {
		return answer;
	}
	const pieces = parseSuggestedDaydream(answer.value);
	return pieces ? { ok: true, value: pieces } : { ok: false, error: NOTHING };
}

/**
 * A few story ideas of the kind the user asked for, for the side they chose
 * under "You as" (null for either). Ideas only — a title, a premise, tags,
 * a level — so asking for a handful stays quick; the one picked is then
 * written out by `suggestDaydream`.
 */
export async function suggestIdeas(input: {
	request: string;
	side: StarterSide | null;
	limits: string;
}): Promise<Answer<GeneratedIdea[]>> {
	const answer = await ask({ task: 'ideas', ...input });
	if (!answer.ok) {
		return answer;
	}
	const ideas = parseGeneratedIdeas(answer.value, input.side);
	return ideas.length > 0 ? { ok: true, value: ideas } : { ok: false, error: NOTHING };
}
