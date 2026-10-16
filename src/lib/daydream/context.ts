import {
	DAYDREAM_LIMITS,
	type DaydreamTurnRole,
	MAX_CONTEXT_CHARS,
	MAX_CONTEXT_TURNS
} from '../daydream';

/**
 * Which turns go with a reply request.
 *
 * The model reads the setup and as much of the conversation as fits, newest
 * first: a scene's recent turns matter most, and the setup carries what must
 * never be forgotten (who the character is, the limits, the safeword). The
 * server refuses a request over the same budget (`replyRequestSchema`), so
 * trimming here is what keeps a long daydream working rather than an
 * optimisation.
 */

export type ContextTurn = { role: DaydreamTurnRole; text: string };

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
		// A turn too long for the server never existed for long — every turn is
		// held to the limit as it is sealed — but cut it rather than send it.
		const text = turn.text.slice(0, DAYDREAM_LIMITS.turn);
		if (used + text.length > budget.chars) {
			break;
		}
		used += text.length;
		kept.push({ role: turn.role, text });
	}
	return kept.reverse();
}
