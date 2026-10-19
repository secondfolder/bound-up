import { z } from 'zod';
import {
	DAYDREAM_LIMITS,
	type DaydreamTurnRole,
	MAX_CONTEXT_CHARS,
	MAX_CONTEXT_TURNS,
	MAX_DIRECTIONS
} from '../daydream';
import {
	type DaydreamMarkContent,
	type DaydreamTurnContent,
	type Direction,
	directionSchema,
	type Reading,
	readingSchema
} from '../sealed-kinds/daydreams';

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
 *
 * The history is sent as it was sent the first time, so each request only
 * adds to the one before (docs/daydreams.md, "Cost"): a passage carries the
 * buttons that were on screen when it was asked for, which the server puts
 * back where they were, and a trimmed story starts with a marker saying so.
 */

export type Reaction = Extract<DaydreamMarkContent, { type: 'reaction' }>['reaction'];

export const contextTurnSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('text'),
		role: z.enum(['user', 'story']),
		text: z.string().min(1).max(DAYDREAM_LIMITS.turn),
		/** A passage stepped out of the story (a check-in, an aside). */
		ooc: z.boolean().optional(),
		reaction: z.enum(['love', 'like', 'not-for-me']).optional(),
		/** How the user said they mean their turn (Read as…), overriding the model's own reading. */
		readAs: readingSchema.optional(),
		/**
		 * A passage's: the direction buttons on screen when it was asked for,
		 * which that request listed (`buttonsNote`). Absent for one written
		 * while the scene was stopped, whose request listed none.
		 */
		buttons: z.array(directionSchema).max(MAX_DIRECTIONS).optional()
	}),
	/** The story before this was trimmed off (`trimContext`). Only ever first. */
	z.object({ type: z.literal('omitted') }),
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
			return turn.text.length + (turn.buttons ? JSON.stringify(turn.buttons).length : 0);
		case 'direction':
			return turn.label.length;
		case 'steer':
			return turn.quote.length;
		case 'roll':
			return turn.outcome.length + 8;
		case 'safety':
			return 8;
		case 'omitted':
			return 0;
		default:
			return 0;
	}
}

/**
 * The user's turn as the passage after it wrote it out, if it did: what the
 * user wrote was an instruction for their turn ("Tell Charlie the fox is
 * safe") and this is the turn itself. See `PassageMeta.expansion`.
 */
export function expansionIn(next: DaydreamTurnContent | null | undefined): string | null {
	return next?.type === 'text' ? (next.meta?.expansion ?? null) : null;
}

/**
 * The reading the user chose for their turn, if the passage after it was
 * written with one forced (Read as…). The model's own readings are not
 * sent back: the passage it wrote already shows how it read the turn.
 */
export function chosenReadingIn(next: DaydreamTurnContent | null | undefined): Reading | null {
	return next?.type === 'text' && next.meta?.readAsChosen ? (next.meta.readAs ?? null) : null;
}

/**
 * A stored turn as the model reads it. Null for a turn that has nothing to
 * say to the model — there is no such kind today, but a newer build's turn
 * this one cannot read lands here too rather than as a hole in the story.
 *
 * For a user's turn, `expansion` is it written out (`expansionIn`), sent in
 * place of the instruction it was written from, so the story the model reads
 * is the one the user sees, and the instruction is not written out a second
 * time; and `readAs` is how the user said they mean it (`chosenReadingIn`).
 * A turn sent written out goes without a reading: it is the turn itself now.
 */
export function toContextTurn(
	role: DaydreamTurnRole,
	content: DaydreamTurnContent,
	about: {
		reaction?: Reaction;
		expansion?: string | null;
		readAs?: Reading | null;
		/** A passage's buttons on screen when it was asked for; undefined when none were listed. */
		buttons?: Direction[];
	} = {}
): ContextTurn | null {
	const { reaction, expansion, readAs, buttons } = about;
	const asUser = role === 'user';
	switch (content.type) {
		case 'text':
			return {
				type: 'text',
				role,
				text: (asUser && expansion ? expansion : content.text).slice(0, DAYDREAM_LIMITS.turn),
				...(content.meta?.ooc ? { ooc: true } : {}),
				...(reaction && !asUser ? { reaction } : {}),
				...(readAs && asUser && !expansion ? { readAs } : {}),
				...(buttons && !asUser ? { buttons } : {})
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

/**
 * How far the cut moves when a story outgrows the budget, in turns. Cutting
 * one turn at a time would change where the history starts on every request,
 * and a provider caches a prompt by its start, so not one request of a long
 * story would be a cache hit. Cut at whole steps, counted from the story's
 * start, the history starts in the same place for a run of requests at the
 * price of up to a step's worth of turns the budget had room for.
 */
export const CONTEXT_TRIM_STEP = 10;

/**
 * The newest turns of `turns` — the branch from its start — that fit the
 * budget, oldest first, after an `omitted` marker when any were cut. It stops at the first turn that does not fit rather
 * than skipping it, so the model never sees a story with a hole in it, and
 * cuts at a whole `CONTEXT_TRIM_STEP` so the cut stays put from one request
 * to the next.
 */
export function trimContext(
	turns: readonly ContextTurn[],
	budget: { chars: number; turns: number } = {
		chars: MAX_CONTEXT_CHARS,
		turns: MAX_CONTEXT_TURNS
	}
): ContextTurn[] {
	let start = turns.length;
	let used = 0;
	for (let index = turns.length - 1; index >= 0; index -= 1) {
		const turn = turns[index];
		if (!turn || turns.length - index > budget.turns) {
			break;
		}
		const size = contextSize(turn);
		if (used + size > budget.chars) {
			break;
		}
		used += size;
		start = index;
	}
	if (start === 0) {
		return [...turns];
	}
	const stepped = Math.ceil(start / CONTEXT_TRIM_STEP) * CONTEXT_TRIM_STEP;
	// Never down to nothing for the sake of a step: the newest turns that fit
	// are the story's present, and the cache is worth less than they are.
	return [{ type: 'omitted' }, ...turns.slice(stepped < turns.length ? stepped : start)];
}
