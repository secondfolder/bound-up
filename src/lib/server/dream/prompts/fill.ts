/**
 * The small calls made after and between passages (docs/dreams.md, "Detail
 * on tap" and "Memory"): filling in an element's card and keeping facts in
 * the elements, expanding a `<more>`, and condensing a finished scene.
 * Each is one short, unstreamed request, and the model's reply is read the
 * same lenient way a passage is.
 *
 * Alias-free, for the bench.
 */

import { type DreamElement, serializeElements } from '../../../dream/elements';
import { styleInstructions, type WritingStyle } from '../../../dream/styles';
import { CORE_RULES, limitsSection, type ModelMessage, wrap } from './core';
import { historyPassage } from './passage';

type Shared = { telling: string; style?: WritingStyle | undefined; limits: readonly string[] };

function system(input: Shared, instructions: string): ModelMessage {
	return {
		role: 'system',
		content: [
			CORE_RULES,
			limitsSection(input.limits),
			wrap('telling', input.telling || 'No notes.'),
			...(input.style ? [wrap('writing-style', styleInstructions(input.style))] : []),
			instructions
		].join('\n\n')
	};
}

const ELEMENTS_INSTRUCTIONS = `This step keeps the daydream's elements up to date: the record of its people and things, which the user reads as cards and which every later passage is written from.

Reply with <elements>…</elements> holding only the elements that change, each written out in full in the same tag form you are given, with the same id. Leave out any element that does not change. Reply <elements></elements> if none do.

- Add durable facts the passages establish: promises made, what has been revealed, who now knows what (in a <knows> field on a character), what someone has started calling someone. Not what merely happened in a scene.
- Keep every field that is still true. Never drop a field, and never contradict what a passage said.
- Keep shown="no" on what the card should not show.
- Write every stat exactly as it stands: code moves stats from the passages' own <set> tags, and has already.`;

const CARD_FOCUS = (id: string) =>
	`The user has opened the card for "${id}", which is still little more than a name. Fill it in: the fields its type calls for (a character's appearance, manner, background and who they are to the user), consistent with everything the passages say about them. Include it in your reply even if nothing else changes.`;

/**
 * Elements as they should now stand, after the latest passage, or with one
 * of them filled in because its card was opened (`focus`). The reply is read
 * by `parseElements`; only elements it returns change.
 */
export function elementsMessages(
	input: Shared & {
		elements: readonly DreamElement[];
		/** The last passage or two, oldest first. */
		passages: readonly string[];
		focus?: string | null;
	}
): ModelMessage[] {
	const parts = [
		wrap('elements', serializeElements(input.elements)),
		wrap('passages', input.passages.map((passage) => historyPassage(passage)).join('\n\n---\n\n'))
	];
	if (input.focus) {
		parts.push(CARD_FOCUS(input.focus));
	}
	return [system(input, ELEMENTS_INSTRUCTIONS), { role: 'user', content: parts.join('\n\n') }];
}

/** One to three sentences for a `<more>` the user tapped, in the daydream's voice. */
export function moreMessages(input: Shared & { passage: string; phrase: string }): ModelMessage[] {
	return [
		system(
			input,
			"This step expands one phrase of a passage the user tapped to read more about. Reply with one to three sentences, in the passage's own voice and tense, that tell more about the phrase. Plain prose, no markup, nothing before or after. Consistent with the passage, and adding nothing that would change what happens next."
		),
		{
			role: 'user',
			content: `${wrap('passage', historyPassage(input.passage))}\n\nMore about: "${input.phrase}"`
		}
	];
}

/** A finished scene condensed to a few lines, for passages long after it. */
export function summaryMessages(input: Shared & { passages: readonly string[] }): ModelMessage[] {
	return [
		system(
			input,
			'This step condenses one finished scene of the daydream into a summary for whoever writes later passages, which will see this instead of the scene itself. Reply with three to six plain sentences: what happened, what changed between people, and anything said that will matter later, keeping exact words where the words are the point. Nothing before or after it.'
		),
		{
			role: 'user',
			content: wrap(
				'scene',
				input.passages.map((passage) => historyPassage(passage)).join('\n\n---\n\n')
			)
		}
	];
}
