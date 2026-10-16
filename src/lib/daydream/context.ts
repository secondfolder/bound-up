import { z } from 'zod';
import {
	DAYDREAM_LIMITS,
	type DaydreamTurnRole,
	MAX_CONTEXT_CHARS,
	MAX_CONTEXT_TURNS
} from '../daydream';
import type { DaydreamMarkContent, DaydreamTurnContent } from '../sealed-kinds/daydreams';

/**
 * Which turns go with a reply request, and in what shape.
 *
 * The model reads the setup and as much of the branch being read as fits,
 * newest first: a scene's recent turns matter most, and the setup carries
 * what must never be forgotten (who is in it, the limits). The server refuses
 * a request over the same budget (`replyRequestSchema`), so trimming here is
 * what keeps a long daydream working rather than an optimisation.
 *
 * Each turn goes as what it is — something written, a direction pressed, a
 * roll — and the server turns that into words for the model. What a passage
 * offered next (its buttons, suggestions and roll card) is never sent back:
 * it was for the screen, and would cost context on every request for
 * nothing. A reaction is, because it says what the user enjoyed.
 */

export type Reaction = Extract<DaydreamMarkContent, { type: 'reaction' }>['reaction'];

export const contextTurnSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('text'),
		role: z.enum(['user', 'story']),
		text: z.string().min(1).max(DAYDREAM_LIMITS.turn),
		/** A passage stepped out of the story (a check-in, an aside). */
		ooc: z.boolean().optional(),
		reaction: z.enum(['love', 'like', 'not-for-me']).optional()
	}),
	z.object({
		type: z.literal('direction'),
		label: z.string().min(1).max(DAYDREAM_LIMITS.directionLabel)
	}),
	z.object({
		type: z.literal('steer'),
		action: z.enum(['more', 'rewrite', 'not-this']),
		quote: z.string().min(1).max(DAYDREAM_LIMITS.quote)
	}),
	z.object({ type: z.literal('safety'), signal: z.enum(['red', 'yellow', 'resume']) }),
	z.object({
		type: z.literal('roll'),
		sides: z.number().int().min(2).max(20),
		result: z.number().int().min(1).max(20),
		outcome: z.string().min(1).max(DAYDREAM_LIMITS.rollOutcome)
	})
]);

export type ContextTurn = z.output<typeof contextTurnSchema>;

/** How much of the budget a turn uses: the words in it, which is what the model is sent. */
export function contextSize(turn: ContextTurn): number {
	switch (turn.type) {
		case 'text':
			return turn.text.length;
		case 'direction':
			return turn.label.length;
		case 'steer':
			return turn.quote.length;
		case 'roll':
			return turn.outcome.length + 8;
		case 'safety':
			return 8;
		default:
			return 0;
	}
}

/**
 * A stored turn as the model reads it. Null for a turn that has nothing to
 * say to the model — there is no such kind today, but a newer build's turn
 * this one cannot read lands here too rather than as a hole in the story.
 */
export function toContextTurn(
	role: DaydreamTurnRole,
	content: DaydreamTurnContent,
	reaction?: Reaction
): ContextTurn | null {
	switch (content.type) {
		case 'text':
			return {
				type: 'text',
				role,
				text: content.text.slice(0, DAYDREAM_LIMITS.turn),
				...(content.meta?.ooc ? { ooc: true } : {}),
				...(reaction && role === 'story' ? { reaction } : {})
			};
		case 'direction':
			return { type: 'direction', label: content.label };
		case 'steer':
			return { type: 'steer', action: content.action, quote: content.quote.text };
		case 'safety':
			return { type: 'safety', signal: content.signal };
		case 'roll':
			return {
				type: 'roll',
				sides: content.sides,
				result: content.result,
				outcome: content.outcome
			};
		default:
			return null;
	}
}

export function trimContext(
	turns: readonly ContextTurn[],
	budget: { chars: number; turns: number } = {
		chars: MAX_CONTEXT_CHARS,
		turns: MAX_CONTEXT_TURNS
	}
): ContextTurn[] {
	const kept: ContextTurn[] = [];
	let used = 0;
	for (let index = turns.length - 1; index >= 0; index -= 1) {
		const turn = turns[index];
		if (!turn || kept.length >= budget.turns) {
			break;
		}
		const size = contextSize(turn);
		if (used + size > budget.chars) {
			// Stop at the first turn that does not fit rather than skipping it,
			// so the model never sees a story with a hole in it.
			break;
		}
		used += size;
		kept.push(turn);
	}
	return kept.reverse();
}
