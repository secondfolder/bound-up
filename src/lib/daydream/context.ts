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
	readingSchema,
	trackerValuesSchema
} from '../sealed-kinds/daydreams';
import type { TrackerValues } from './trackers';

/**
 * Which turns go with a reply request, and in what shape.
 *
 * The model reads the setup and as much of the branch being read as fits,
 * newest first: a daydream's recent turns matter most, and the setup carries
 * what must never be forgotten (who is in it, the limits). The server refuses
 * a request over the same budget (`replyRequestSchema`), so trimming here is
 * what keeps a long daydream working rather than an optimisation.
 *
 * Each turn goes as what it is — something written, a direction pressed, a
 * roll — and the server turns that into words for the model. What a passage
 * offered next (its buttons, suggestions and roll card) is never sent back:
 * it was for the screen, and would cost context on every request for
 * nothing. A reaction is, because it says what the user enjoyed, and so is
 * the picture a passage described, so the model can tell whether a new one
 * would show anything new (`passageAsSent`).
 *
 * The history is sent as it was sent the first time, so each request only
 * adds to the one before (docs/daydreams.md, "Cost"): a passage carries the
 * buttons that were on screen when it was asked for, which the server puts
 * back where they were, and a trimmed story starts with a marker saying so.
 */

export type Reaction = Extract<DaydreamMarkContent, { type: 'reaction' }>['reaction'];

/** A passage written back with the user's turn it wrote out ahead of it, at the most. */
export const MAX_PASSAGE_AS_SENT = DAYDREAM_LIMITS.turn * 2 + 32;

/** How much of a passage a reaction quotes to say which one it is on. */
const REACTION_EXCERPT = 60;

/**
 * A passage as the model is shown it later: as it wrote it, the user's turn
 * written out first in its `<yours>` block when it wrote one out, then the
 * passage, then the picture it described, as metadata of the shape it wrote
 * it in. The tags it opened with and the rest of the metadata are left off.
 *
 * The picture goes back so the model can tell whether a new one would show
 * anything the last did not (`imageInstruction`): it cannot judge "little
 * has changed since the last picture" without knowing what that picture was.
 * It is part of the passage from the moment it is written, so the history
 * still only ever adds to itself (docs/daydreams.md, "Cost"). A rewrite's
 * quote of the passage it rewrites leaves it off: that asks for prose.
 */
export function passageAsSent(
	text: string,
	expansion: string | null | undefined,
	image?: string | null
): string {
	const passage = expansion ? `<yours>\n${expansion}\n</yours>\n${text}` : text;
	return image ? `${passage}\n<meta>\n${JSON.stringify({ image })}\n</meta>` : passage;
}

/** The start of a passage, to say which one a reaction is on. */
export function passageExcerpt(text: string): string {
	return text.length > REACTION_EXCERPT ? `${text.slice(0, REACTION_EXCERPT).trimEnd()}…` : text;
}

/**
 * What a rewrite's request asks: the passage it replaces, as it was sent, and
 * what to change. `again` is "Write again": another take, which changes
 * nothing in particular but goes a different way (docs/daydreams.md,
 * "Another take"), so it never comes with a quote or an instruction.
 */
export const rewriteSchema = z
	.object({
		targetText: z.string().min(1).max(MAX_PASSAGE_AS_SENT),
		quote: z.string().max(DAYDREAM_LIMITS.quote).optional(),
		instruction: z.string().max(DAYDREAM_LIMITS.instruction).optional(),
		again: z.literal(true).optional()
	})
	.refine(
		(value) => !(value.again && (value.quote || value.instruction)),
		'Another take is not asked to change anything in particular'
	);

export type RewriteRequest = z.output<typeof rewriteSchema>;

/**
 * One of an idea's openings as a first passage was written from it
 * (docs/daydreams.md, "Openings"): what its request said, kept with the
 * passage so the history sends that request again exactly as it was sent.
 */
export const openingSnapshotSchema = z.object({
	label: z.string().trim().min(1).max(DAYDREAM_LIMITS.openingLabel),
	situation: z.string().trim().min(1).max(DAYDREAM_LIMITS.openingSituation)
});

export type OpeningSnapshot = z.output<typeof openingSnapshotSchema>;

export const contextTurnSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('text'),
		role: z.enum(['user', 'story']),
		text: z.string().min(1).max(DAYDREAM_LIMITS.turn),
		/** A passage stepped out of the story (a check-in, an aside). */
		ooc: z.boolean().optional(),
		/** How the user said they mean their turn (Read as…), overriding the model's own reading. */
		readAs: readingSchema.optional(),
		/**
		 * A passage's: the user's turn it wrote out first, which goes back
		 * with it as the model wrote it (`passageAsSent`), the user's own turn
		 * staying as they sent it.
		 */
		expansion: z.string().min(1).max(DAYDREAM_LIMITS.turn).optional(),
		/** A passage's: the picture it described, which goes back with it (`passageAsSent`). */
		image: z.string().min(1).max(DAYDREAM_LIMITS.imagePrompt).optional(),
		/**
		 * A passage's that rewrote another, or was another take on it: what
		 * its request asked (`rewriteRequest` in `server/daydream/prompt.ts`),
		 * which goes back in place of the plain request it would otherwise
		 * have had.
		 */
		rewrite: rewriteSchema.optional(),
		/** A first passage's: the opening it was written from, which its request named. */
		opening: openingSnapshotSchema.optional(),
		/**
		 * A passage's: the direction buttons on screen when it was asked for,
		 * which that request listed (`buttonsNote`). Absent for one written
		 * while the scene was stopped, whose request listed none.
		 */
		buttons: z.array(directionSchema).max(MAX_DIRECTIONS).optional(),
		/**
		 * A passage's: what the story kept track of when it was asked for,
		 * which that request listed (`trackersNote`). Absent for an idea with
		 * no trackers, and for one written while the scene was stopped.
		 */
		trackers: trackerValuesSchema.optional()
	}),
	/** The story before this was trimmed off (`trimContext`). Only ever first. */
	z.object({ type: z.literal('omitted') }),
	/**
	 * A reaction, where it was made: after the turn that was newest then
	 * (`reactionAnchors`). `of` is the start of the passage it is on, when it
	 * is not the passage just before it.
	 */
	z.object({
		type: z.literal('reaction'),
		reaction: z.enum(['love', 'like', 'not-for-me']),
		of: z
			.string()
			.max(REACTION_EXCERPT + 1)
			.nullable()
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
			return (
				turn.text.length +
				(turn.expansion?.length ?? 0) +
				(turn.image?.length ?? 0) +
				(turn.opening ? turn.opening.label.length + turn.opening.situation.length : 0) +
				(turn.rewrite
					? turn.rewrite.targetText.length +
						(turn.rewrite.quote?.length ?? 0) +
						(turn.rewrite.instruction?.length ?? 0)
					: 0) +
				(turn.buttons ? JSON.stringify(turn.buttons).length : 0) +
				(turn.trackers ? JSON.stringify(turn.trackers).length : 0)
			);
		case 'reaction':
			return (turn.of?.length ?? 0) + 8;
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
 * Every turn goes back as it was first sent, so each request only adds to
 * the one before (docs/daydreams.md, "Cost"). A user's turn goes as they
 * wrote it, with `readAs` when they chose how it is meant
 * (`chosenReadingIn`), even when the passage after it wrote it out: the
 * written-out turn goes back with that passage (`passageAsSent`). A passage
 * carries what its request listed and asked: `buttons`, and `rewrite` for
 * one that rewrote another.
 */
export function toContextTurn(
	role: DaydreamTurnRole,
	content: DaydreamTurnContent,
	about: {
		readAs?: Reading | null;
		/** A passage's buttons on screen when it was asked for; undefined when none were listed. */
		buttons?: Direction[];
		/** For a passage that rewrote another: the passage it rewrote, as it was sent. */
		rewrote?: string;
		/** A passage's trackers' values when it was asked for; undefined when none were listed. */
		trackers?: TrackerValues;
	} = {}
): ContextTurn | null {
	const { readAs, buttons, rewrote, trackers } = about;
	const asUser = role === 'user';
	switch (content.type) {
		case 'text': {
			const expansion = asUser ? null : (content.meta?.expansion ?? null);
			const rewriteOf = asUser ? null : (content.meta?.rewriteOf ?? null);
			const image = asUser ? null : (content.meta?.image ?? null);
			const opening = asUser ? null : (content.meta?.opening ?? null);
			return {
				type: 'text',
				role,
				text: content.text.slice(0, DAYDREAM_LIMITS.turn),
				...(content.meta?.ooc ? { ooc: true } : {}),
				...(readAs && asUser ? { readAs } : {}),
				...(expansion ? { expansion: expansion.slice(0, DAYDREAM_LIMITS.turn) } : {}),
				...(image ? { image } : {}),
				...(opening ? { opening } : {}),
				...(rewriteOf && rewrote
					? {
							rewrite: {
								targetText: rewrote.slice(0, MAX_PASSAGE_AS_SENT),
								...(rewriteOf.quote ? { quote: rewriteOf.quote.text } : {}),
								...(rewriteOf.instruction ? { instruction: rewriteOf.instruction } : {}),
								...(rewriteOf.again ? { again: true as const } : {})
							}
						}
					: {}),
				...(buttons && !asUser ? { buttons } : {}),
				...(trackers && !asUser ? { trackers } : {})
			};
		}
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
