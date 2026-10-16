/**
 * Asking the model for suggestions while setting up, and reading what comes
 * back. BROWSER ONLY: it goes through `client.ts`.
 *
 * Each answers either the checked suggestion or words for why there is none;
 * a suggestion is a convenience, so a failure is shown where it was asked
 * for and nothing else changes.
 */

import type { CharacterDials, DaydreamScene, StoryDials } from '../daydream';
import { requestSuggestion } from './client';
import {
	completionJson,
	parseChips,
	parseFill,
	parseSurpriseScene,
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

export async function suggestChips(input: {
	target: SuggestTarget;
	field: string;
	draft: Record<string, string>;
	dials?: CharacterDials;
	context: SuggestContext;
}): Promise<Answer<string[]>> {
	const answer = await ask({ task: 'chips', ...input });
	if (!answer.ok) {
		return answer;
	}
	const chips = parseChips(answer.value);
	return chips.length > 0 ? { ok: true, value: chips } : { ok: false, error: NOTHING };
}

export async function suggestFill(input: {
	target: SuggestTarget;
	draft: Record<string, string>;
	dials?: CharacterDials;
	context: SuggestContext;
}): Promise<Answer<Partial<Record<string, string>>>> {
	const answer = await ask({ task: 'fill', ...input });
	if (!answer.ok) {
		return answer;
	}
	const filled = parseFill(input.target, answer.value);
	return Object.keys(filled).length > 0
		? { ok: true, value: filled }
		: { ok: false, error: NOTHING };
}

export async function surpriseScene(context: SuggestContext): Promise<Answer<DaydreamScene>> {
	const answer = await ask({ task: 'surprise-scene', target: 'scene', draft: {}, context });
	if (!answer.ok) {
		return answer;
	}
	const scene = parseSurpriseScene(answer.value);
	return scene ? { ok: true, value: scene } : { ok: false, error: NOTHING };
}
