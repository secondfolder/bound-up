/**
 * Every passage after the opening (docs/dreams.md, "Prompt assembly"), in a
 * fixed order: the core and the chosen capabilities first, which do not
 * change and so stay cached; then this daydream's setup; then the story so
 * far; and last what is happening now, where it steers most.
 *
 * Alias-free, for the bench.
 */

import type { Build } from '../../../dream/build';
import { allowedTags } from '../../../dream/capabilities';
import { serializeElements } from '../../../dream/elements';
import { nextNote, parseFooter } from '../../../dream/footer';
import { findTag, parseMarkup, plainText } from '../../../dream/markup';
import type { UserTurn } from '../../../dream/story';
import { bulletList, CORE_RULES, limitsSection, type ModelMessage, wrap } from './core';
import { passageFormat } from './passage-format';

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
	/**
	 * A passage the user turned down with "Different direction": the next one
	 * answers the same turn with something else happening.
	 */
	notThis?: string | null;
	/** The direction code picked for the passage, which it should take. */
	steer?: string | null;
	/** `directions` asks for where the next passage could go, rather than the passage. */
	mode?: 'passage' | 'directions';
};

const FOOTER_TAG = /<after>[\s\S]*?(?:<\/after>|$)/;

const TAG = /<\/?(?<name>[a-z][\w-]*)\b[^>]*>/gi;

/**
 * A past passage as it goes back to the model: markup kept, footer cut to its
 * "next" line. With `allowed`, any tag this daydream did not enable is
 * unwrapped to its words: a model imitates its own history, so one stray
 * `<sound>` in a passage otherwise turned up in every passage after it (seen
 * on a 20-passage simulated session).
 */
export function historyPassage(source: string, allowed?: ReadonlySet<string>): string {
	let body = source.replace(FOOTER_TAG, '').trim();
	if (allowed) {
		body = body.replace(TAG, (tag, ...rest) => {
			const groups = rest.at(-1) as { name?: string } | undefined;
			return allowed.has(groups?.name?.toLowerCase() ?? '') ? tag : '';
		});
	}
	const next = lastNext(source);
	return next ? `${body}\n<after>\n${JSON.stringify({ next })}\n</after>` : body;
}

/** What Continue asks for: whatever moves the story on most interestingly, by the story's choice. */
export const CONTINUE =
	'The user pressed Continue without writing anything. That is not their character staying silent or doing nothing: it hands the next step to you. Decide what happens next, the most interesting way forward from here. Their character may go along with what is being asked of them, or push back, or something else may happen; choose what the story is most alive for, and write their part in it.';

/**
 * The user's turn as the model reads it. Choices and fields go as plain
 * structured lines after the words, and a field left empty is reported as
 * skipped, so the story can use it (docs/dreams.md, "Fields").
 */
export function describeTurn(turn: UserTurn): string {
	const parts: string[] = [];
	const filled =
		(turn.choices?.length ?? 0) +
			(turn.fields?.length ?? 0) +
			(turn.answers?.length ?? 0) +
			(turn.rolls?.length ?? 0) >
		0;
	if (turn.kind === 'words') {
		parts.push(wrap('user', turn.text));
	} else if (!filled) {
		// Not silence from the user's character, which a character then
		// reacted to, and not their going along either: what happens next is
		// the story's to decide (docs/dreams.md, "Continue").
		parts.push(CONTINUE);
	}
	for (const roll of turn.rolls ?? []) {
		parts.push(
			`The user rolled ${roll.value} on the d${roll.sides} you offered ("${roll.id}"). Carry on from that outcome.`
		);
	}
	for (const answer of turn.answers ?? []) {
		parts.push(`The user answered your question "${answer.id}": ${JSON.stringify(answer.text)}`);
	}
	if (turn.choices && turn.choices.length > 0) {
		parts.push(
			`The user's choices in the passage: ${turn.choices.map((choice) => `${choice.id} = ${JSON.stringify(choice.value)}`).join('; ')}`
		);
	}
	const blocks = new Map<string, string[]>();
	for (const field of turn.fields ?? []) {
		const lines = blocks.get(field.block) ?? [];
		lines.push(`${field.name}: ${field.value ? JSON.stringify(field.value) : 'skipped'}`);
		blocks.set(field.block, lines);
	}
	for (const [block, lines] of blocks) {
		parts.push(`The user filled in ${block}: ${lines.join('; ')}`);
	}
	return parts.join('\n');
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

/**
 * Asking where the story could go, for "Different direction" and for
 * escaping a loop (docs/dreams.md, "Different direction"): the same list and
 * likelihoods as step 1, so code can pick leaning towards the unlikely.
 */
const DIRECTIONS_ASK = `Do not write the passage yet. List 3 to 5 directions the next passage could take, each one line, genuinely different from each other in what happens:
<directions>
<direction p="0.30">one line: what happens next</direction>
</directions>
p is how likely you would have been to write that one. Include unlikely ones as well as likely ones; the unlikely ones are wanted. Nothing else.`;

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
	const allowed = allowedTags(input.setup.capabilities);
	if (input.notThis) {
		parts.push(
			`This passage was written for this moment, and the user wants something else to happen:\n${wrap('not-this', historyPassage(input.notThis, allowed))}\nNot this: what happens must be different, not only the words.`
		);
	}
	if (input.mode === 'directions') {
		parts.push(DIRECTIONS_ASK);
	} else if (input.take) {
		parts.push(
			`This passage was already written for this moment:\n${wrap('take', historyPassage(input.take, allowed))}\nWrite it again: the same events, in new words. Do not reuse its sentences or its images.`
		);
	} else if (input.steer) {
		parts.push(
			`Write the next passage now, taking it in this direction: ${input.steer}\nEnd it with its footer.`
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
	const allowed = allowedTags(input.setup.capabilities);
	const messages: ModelMessage[] = [{ role: 'system', content: system }];
	if (input.summaries && input.summaries.length > 0) {
		messages.push({
			role: 'user',
			content: `The story so far, scene by scene, before the passages below:\n${wrap('summaries', input.summaries.map((summary, index) => `Scene ${index + 1}: ${summary}`).join('\n\n'))}`
		});
	}
	for (const [index, entry] of input.history.entries()) {
		messages.push({ role: 'assistant', content: historyPassage(entry.passage, allowed) });
		// Every turn but the last goes between passages; the last is in "now".
		if (index < input.history.length - 1) {
			messages.push({ role: 'user', content: describeTurn(entry.turn) });
		}
	}
	messages.push({ role: 'user', content: nowSection(input, last) });
	return messages;
}
