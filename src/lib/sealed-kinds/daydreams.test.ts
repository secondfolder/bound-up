import { describe, expect, it } from 'vitest';
import { DAYDREAM_LIMITS, MAX_SUGGESTIONS } from '../daydream';
import { daydreamTurnKind } from './daydreams';

/**
 * How long `sb1.` sealing makes a payload of `bytes`: a 12-byte IV and a
 * 16-byte tag around the ciphertext, base64url without padding
 * (`src/lib/sealed-fixtures/README.md`).
 */
const sealedLength = (bytes: number) => 'sb1.'.length + Math.ceil(((12 + bytes + 16) * 4) / 3);

describe('daydreamTurnKind', () => {
	it('fits a passage at every cap, kept raw as well, inside its ciphertext cap', () => {
		// Prose a model writes is nearly all ASCII; the worst realistic case is
		// every field full, with the raw reply repeating them.
		const passage = {
			type: 'text' as const,
			text: 'x'.repeat(DAYDREAM_LIMITS.turn),
			meta: {
				suggestions: Array.from({ length: MAX_SUGGESTIONS }, () =>
					'y'.repeat(DAYDREAM_LIMITS.suggestion)
				),
				directions: { add: [], remove: [] },
				expansion: 'z'.repeat(DAYDREAM_LIMITS.turn)
			},
			raw: 'r'.repeat(DAYDREAM_LIMITS.rawReply),
			rawTruncated: true as const
		};
		expect(daydreamTurnKind.latest.safeParse(passage).success).toBe(true);
		const bytes = new TextEncoder().encode(JSON.stringify(passage)).length;
		expect(sealedLength(bytes)).toBeLessThanOrEqual(daydreamTurnKind.maxCiphertextLength);
	});

	it('refuses a raw reply past its cap', () => {
		expect(
			daydreamTurnKind.latest.safeParse({
				type: 'text',
				text: 'x',
				raw: 'r'.repeat(DAYDREAM_LIMITS.rawReply + 1)
			}).success
		).toBe(false);
	});
});
