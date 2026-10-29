/**
 * Every passage after the opening (docs/dreams.md, "Prompt assembly"), in a
 * fixed order: the core and the chosen capabilities first, which do not
 * change and so stay cached; then this daydream's setup; then the story so
 * far; and last what is happening now, where it steers most.
 *
 * Alias-free, for the bench.
 */

import type { Build } from '../../../dream/build';
import { serializeElements } from '../../../dream/elements';
import { nextNote, parseFooter } from '../../../dream/footer';
import { findTag, parseMarkup, plainText } from '../../../dream/markup';
import { bulletList, CORE_RULES, limitsSection, type ModelMessage, wrap } from './core';
import { passageFormat } from './passage-format';

export type UserTurn = { kind: 'continue' } | { kind: 'words'; text: string };

export type PassageInput = {
	setup: Pick<Build, 'heat' | 'telling' | 'capabilities' | 'elements' | 'presentation'> & {
		musts: readonly string[];
		research: string;
	};
	limits: readonly string[];
	preferences: readonly string[];
	/**
	 * The story so far, opening first: each passage's source and the user's
	 * turn after it. The last entry's turn is the one being answered.
	 */
	history: readonly { passage: string; turn: UserTurn }[];
	/** Phrases repeated in recent passages, for "don't reuse". */
	repeated: readonly string[];
	/**
	 * Earlier scenes, condensed, oldest first: the story before `history`
	 * begins (docs/dreams.md, "Memory"). Only ever added to, so the start of
	 * the prompt stays the same and stays cached.
	 */
	summaries?: readonly string[];
	/**
	 * A passage to write again: the same events in new words ("Another
	 * take"). It answers the same turn as the one it replaces.
	 */
	take?: string | null;
};

const FOOTER_TAG = /<after>[\s\S]*?(?:<\/after>|$)/;

/** A past passage as it goes back to the model: markup kept, footer cut to its "next" line. */
export function historyPassage(source: string): string {
	const body = source.replace(FOOTER_TAG, '').trim();
	const next = lastNext(source);
	return next ? `${body}\n<after>\n${JSON.stringify({ next })}\n</after>` : body;
}

function describeTurn(turn: UserTurn): string {
	return turn.kind === 'continue'
		? 'The user pressed Continue, without writing anything: carry the story on.'
		: wrap('user', turn.text);
}

function setupSection(input: PassageInput): string {
	const { setup } = input;
	const parts = [wrap('telling', setup.telling || 'No notes: follow the brief.')];
	parts.push(
		`How sexual it is: ${setup.heat}. Presentation: ${setup.presentation.view} view. ${setup.presentation.notes}`.trim()
	);
	if (setup.musts.length > 0) {
		parts.push(`What the brief requires:\n${bulletList(setup.musts)}`);
	}
	if (setup.elements.length > 0) {
		parts.push(wrap('elements', serializeElements(setup.elements)));
	}
	if (setup.research) {
		parts.push(wrap('research', setup.research));
	}
	if (input.preferences.length > 0) {
		parts.push(wrap('preferences', bulletList(input.preferences)));
	}
	return parts.join('\n\n');
}

function lastNext(passage: string): string | null {
	const footer = findTag(parseMarkup(passage, { final: true }), 'after');
	return footer ? nextNote(parseFooter(plainText(footer.children))) : null;
}

function nowSection(
	input: PassageInput,
	last: { passage: string; turn: UserTurn } | undefined
): string {
	// No last passage only for another take of the opening.
	const parts = [last ? describeTurn(last.turn) : 'This is the opening passage.'];
	const next = last ? lastNext(last.passage) : null;
	if (next) {
		parts.push(`Where the last passage thought the story could go: ${next}`);
	}
	if (input.repeated.length > 0) {
		parts.push(
			`Phrases already used more than once; do not reuse them: ${input.repeated.map((phrase) => `"${phrase}"`).join(', ')}`
		);
	}
	if (input.take) {
		parts.push(
			`This passage was already written for this moment:\n${wrap('take', historyPassage(input.take))}\nWrite it again: the same events, in new words. Do not reuse its sentences or its images.`
		);
	} else {
		parts.push('Write the next passage now, ending with its footer.');
	}
	return parts.join('\n\n');
}

/**
 * The messages for the next passage. With no history it writes the opening
 * (an opening the build wrote but that was never kept), or another take of it.
 */
export function passageMessages(input: PassageInput): ModelMessage[] {
	const last = input.history.at(-1);
	const system = [
		CORE_RULES,
		limitsSection(input.limits),
		passageFormat(input.setup.capabilities),
		setupSection(input)
	].join('\n\n');
	const messages: ModelMessage[] = [{ role: 'system', content: system }];
	if (input.summaries && input.summaries.length > 0) {
		messages.push({
			role: 'user',
			content: `The story so far, scene by scene, before the passages below:\n${wrap('summaries', input.summaries.map((summary, index) => `Scene ${index + 1}: ${summary}`).join('\n\n'))}`
		});
	}
	for (const [index, entry] of input.history.entries()) {
		messages.push({ role: 'assistant', content: historyPassage(entry.passage) });
		// Every turn but the last goes between passages; the last is in "now".
		if (index < input.history.length - 1) {
			messages.push({ role: 'user', content: describeTurn(entry.turn) });
		}
	}
	messages.push({ role: 'user', content: nowSection(input, last) });
	return messages;
}
