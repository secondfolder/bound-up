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
	ScenePart,
	StoryDials
} from '../daydream';
import { requestSuggestion } from './client';
import {
	completionJson,
	parseCasting,
	parseChips,
	parseFill,
	parseName,
	parseParts,
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
	context: SuggestContext;
}): Promise<Answer<string[]>> {
	const answer = await ask({ task: 'chips', ...withParts(input) });
	if (!answer.ok) {
		return answer;
	}
	const chips = parseChips(answer.value);
	return chips.length > 0 ? { ok: true, value: chips } : { ok: false, error: NOTHING };
}

/** What "Fill in the rest" came back with: text for empty fields, and a scene's parts when it had none. */
export type Filled = { fields: Partial<Record<string, string>>; parts: SuggestedPart[] };

export async function suggestFill(input: {
	target: SuggestTarget;
	draft: Record<string, string>;
	parts?: PartsDraft;
	dials?: CharacterDials;
	context: SuggestContext;
}): Promise<Answer<Filled>> {
	const answer = await ask({ task: 'fill', ...withParts(input) });
	if (!answer.ok) {
		return answer;
	}
	const fields = parseFill(input.target, answer.value);
	const parts = input.target === 'scene' ? parseParts(answer.value) : [];
	return Object.keys(fields).length > 0 || parts.length > 0
		? { ok: true, value: { fields, parts } }
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

export async function surpriseScene(
	context: SuggestContext
): Promise<Answer<Omit<DaydreamScene, 'parts'> & { parts: SuggestedPart[] }>> {
	const answer = await ask({ task: 'surprise-scene', target: 'scene', draft: {}, context });
	if (!answer.ok) {
		return answer;
	}
	const scene = parseSurpriseScene(answer.value);
	return scene ? { ok: true, value: scene } : { ok: false, error: NOTHING };
}
