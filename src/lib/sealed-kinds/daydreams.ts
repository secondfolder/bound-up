/**
 * The sealed kinds behind Daydreams: a daydream's setup, and each turn of its
 * conversation. Both sealed in the writer's own vault. See `../sealed.ts` for
 * what a kind is and the rules every version follows, and docs/daydreams.md
 * for what the server sees beside them, and the one moment it sees more.
 *
 * Turns are plain text rather than rich-text documents: a character's reply
 * is written by a language model, which writes prose, and the user's side is
 * flattened to text before it is sent to one anyway.
 */

import { z } from 'zod';
import { DAYDREAM_LIMITS } from '../daydream';
import { defineSealedKind } from '../sealed';

const required = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) => z.string().trim().max(max);

export const daydreamSetupKind = defineSealedKind({
	name: 'daydream-setup',
	// Every field at its cap, JSON-escaped, sealed and base64url'd, fits well inside.
	maxCiphertextLength: 32 * 1024,
	versions: [
		{
			version: 1,
			schema: z.object({
				title: required(DAYDREAM_LIMITS.title),
				characterName: required(DAYDREAM_LIMITS.characterName),
				persona: optional(DAYDREAM_LIMITS.persona),
				lead: z.enum(['character', 'me', 'shared']),
				scenario: required(DAYDREAM_LIMITS.scenario),
				tone: optional(DAYDREAM_LIMITS.tone),
				limits: optional(DAYDREAM_LIMITS.limits),
				safeword: optional(DAYDREAM_LIMITS.safeword)
			})
		}
	]
});

export type DaydreamSetupContent = z.output<typeof daydreamSetupKind.latest>;

export const daydreamTurnKind = defineSealedKind({
	name: 'daydream-turn',
	maxCiphertextLength: 48 * 1024,
	// Not trimmed: a reply's own spacing is part of it, and a turn is stored
	// exactly as it was shown.
	versions: [
		{
			version: 1,
			schema: z.object({ text: z.string().min(1).max(DAYDREAM_LIMITS.turn) })
		}
	]
});

export type DaydreamTurnContent = z.output<typeof daydreamTurnKind.latest>;
