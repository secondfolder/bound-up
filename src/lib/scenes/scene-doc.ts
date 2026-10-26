/**
 * The parts of a scene that live in its shared Yjs document beside the body
 * and the title: what has become of each prompt in this scene ("added",
 * "we've got this", "not for us"). Kept in the document rather than anywhere
 * else because it is about this scene and both people planning it: it syncs
 * live, is sealed with every other edit, and is versioned with the page,
 * without a table or an endpoint of its own. See docs/scenes.md, "Where the
 * prompts' state lives".
 *
 * BROWSER ONLY at run time, like the rest of the notebook's live code.
 */

import type { Doc, Map as YMap } from 'yjs';
import type { PromptOutcome } from './considerations';

/** The shared type each scene's prompt outcomes live in. Ignored by journal entries and notes. */
export const PROMPTS_FIELD = 'prompts';

type StoredOutcome = { outcome: PromptOutcome; by: string };

function isStoredOutcome(value: unknown): value is StoredOutcome {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const { outcome, by } = value as Record<string, unknown>;
	return (
		(outcome === 'added' || outcome === 'handled' || outcome === 'dismissed') &&
		typeof by === 'string'
	);
}

export function promptsMap(doc: Doc): YMap<unknown> {
	return doc.getMap(PROMPTS_FIELD);
}

/** Every prompt this scene has dealt with. Anything malformed, from a buggy build, is skipped. */
export function readOutcomes(doc: Doc): Map<string, PromptOutcome> {
	const outcomes = new Map<string, PromptOutcome>();
	for (const [id, value] of promptsMap(doc).entries()) {
		if (isStoredOutcome(value)) {
			outcomes.set(id, value.outcome);
		}
	}
	return outcomes;
}

export function setOutcome(doc: Doc, promptId: string, outcome: PromptOutcome, by: string): void {
	promptsMap(doc).set(promptId, { outcome, by } satisfies StoredOutcome);
}

export function clearOutcome(doc: Doc, promptId: string): void {
	promptsMap(doc).delete(promptId);
}

/** Calls `onChange` whenever the outcomes change, here or on another device. Returns the teardown. */
export function watchOutcomes(doc: Doc, onChange: () => void): () => void {
	const map = promptsMap(doc);
	map.observe(onChange);
	return () => map.unobserve(onChange);
}
