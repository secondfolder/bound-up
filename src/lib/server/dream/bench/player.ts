/**
 * The simulated player (docs/dreams.md, "The bench"): a model playing the
 * user for a session, so a long story's memory, repetition and format can be
 * checked without anyone playing it by hand.
 *
 * It sees only what a user would: each passage's words as rendered, without
 * the markup or the footer. It acts through a user's turns: words, or
 * Continue. (Cycles, answers and rolls join it with phase 3.)
 *
 * Alias-free, for the bench.
 */

import type { UserTurn } from '../../../dream/story';
import { proseOf } from '../../../dream/story';
import type { ModelMessage } from '../prompts/core';

/** Who the player is, each a short prompt (the plan's personas). */
export const PERSONAS = {
	eager:
		'You are an eager, wordy reader. Each turn you write two to four sentences: what you do and say, with feeling, adding details of your own.',
	terse:
		'You are a terse reader. Each turn is one to four words, like "ok", "more", "kneel", "go on". Sometimes just CONTINUE.',
	steers:
		'You steer constantly. Each turn you push the story somewhere it was not going: a new place, a new person, a change of pace. One or two sentences.',
	contrary:
		'You are contrary. You refuse what you are asked, do the opposite, or question the premise, in character. One or two sentences.',
	continues: 'You only ever press Continue. Reply CONTINUE every time.',
	explorer:
		'You are curious about everything in the story: you ask about people and things you have seen mentioned, look around, and pick up what you find. One or two sentences.'
} as const satisfies Record<string, string>;

export type Persona = keyof typeof PERSONAS;

export function isPersona(value: string): value is Persona {
	return Object.hasOwn(PERSONAS, value);
}

/** How many recent passages the player sees: what a reader would have on screen. */
const SEEN_PASSAGES = 3;

/** The player's next turn, from the story so far. */
export function playerMessages(
	persona: Persona,
	brief: string,
	story: readonly { passage: string; turn: UserTurn | null }[]
): ModelMessage[] {
	const recent = story.slice(-SEEN_PASSAGES).flatMap((entry) => {
		const lines = [`STORY:\n${proseOf(entry.passage)}`];
		if (entry.turn) {
			lines.push(`YOU: ${entry.turn.kind === 'continue' ? 'CONTINUE' : entry.turn.text}`);
		}
		return lines;
	});
	return [
		{
			role: 'system',
			content: `You are testing an interactive fiction app for adults by playing the reader. You asked for: "${brief}". ${PERSONAS[persona]}\n\nReply with your next turn only, in the first person, with no quotation marks and nothing else. Reply CONTINUE to let the story carry on without you.`
		},
		{ role: 'user', content: `${recent.join('\n\n')}\n\nYour turn.` }
	];
}

const CONTINUE = /^\s*continue\.?\s*$/i;
const WRAPPING_QUOTES = /^"|"$/g;
const MAX_TURN_CHARS = 1000;

/** The player's reply as a turn: Continue when it says so or says nothing. */
export function readPlayerTurn(text: string): UserTurn {
	const turn = text.trim().replace(WRAPPING_QUOTES, '').trim();
	if (!turn || CONTINUE.test(turn)) {
		return { kind: 'continue' };
	}
	return { kind: 'words', text: turn.slice(0, MAX_TURN_CHARS) };
}
