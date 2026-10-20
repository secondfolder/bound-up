import { describe, expect, it } from 'vitest';
import { DAYDREAM_LIMITS, MAX_SUGGESTIONS } from '../daydream';
import { MAX_PICTURE_REQUEST_PROMPT } from '../daydream/image-prompt';
import { RECEIVED_LIMITS } from '../daydream/received-record';
import { daydreamMarkKind, daydreamTurnKind } from './daydreams';

/**
 * How long `sb1.` sealing makes a payload of `bytes`: a 12-byte IV and a
 * 16-byte tag around the ciphertext, base64url without padding
 * (`src/lib/sealed-fixtures/README.md`).
 */
const sealedLength = (bytes: number) => 'sb1.'.length + Math.ceil(((12 + bytes + 16) * 4) / 3);

describe('daydreamTurnKind', () => {
	it('fits a passage at every cap, kept raw as well, inside its ciphertext cap', () => {
		// Prose a model writes is nearly all ASCII; the worst realistic case is
		// every field full, with the raw reply repeating them, and what the
		// request sent recorded beside it.
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
			// The reasoning shares `rawReply` with `raw`, so all of it is the worst case.
			raw: 'r'.repeat(DAYDREAM_LIMITS.rawReply / 2),
			rawTruncated: true as const,
			received: {
				reasoning: 'q'.repeat(DAYDREAM_LIMITS.rawReply / 2),
				reasoningTruncated: true as const,
				model: 'm'.repeat(RECEIVED_LIMITS.name),
				provider: 'p'.repeat(RECEIVED_LIMITS.name),
				generationId: 'g'.repeat(RECEIVED_LIMITS.name),
				finishReason: 'f'.repeat(RECEIVED_LIMITS.finishReason),
				usage: 'u'.repeat(RECEIVED_LIMITS.usage)
			},
			sent: {
				system: 's'.repeat(DAYDREAM_LIMITS.sentSystem),
				added: ['a'.repeat(DAYDREAM_LIMITS.sentAdded)],
				history: { messages: 200, chain: 'f'.repeat(64) },
				truncated: true as const
			}
		};
		expect(daydreamTurnKind.latest.safeParse(passage).success).toBe(true);
		const bytes = new TextEncoder().encode(JSON.stringify(passage)).length;
		expect(sealedLength(bytes)).toBeLessThanOrEqual(daydreamTurnKind.maxCiphertextLength);
	});

	it('refuses a record of what was sent past its caps', () => {
		const sent = (system: number, added: string[]) =>
			daydreamTurnKind.latest.safeParse({
				type: 'text',
				text: 'x',
				sent: { system: 's'.repeat(system), added, history: { messages: 0, chain: '0'.repeat(64) } }
			}).success;
		expect(sent(DAYDREAM_LIMITS.sentSystem, [])).toBe(true);
		expect(sent(DAYDREAM_LIMITS.sentSystem + 1, [])).toBe(false);
		const half = 'a'.repeat(DAYDREAM_LIMITS.sentAdded / 2 + 1);
		expect(sent(0, [half, half])).toBe(false);
	});

	it('refuses a reply and its reasoning past the cap they share', () => {
		const kept = (raw: number, reasoning: number) =>
			daydreamTurnKind.latest.safeParse({
				type: 'text',
				text: 'x',
				raw: 'r'.repeat(raw),
				received: { reasoning: 'q'.repeat(reasoning) }
			}).success;
		expect(kept(DAYDREAM_LIMITS.rawReply - 10, 10)).toBe(true);
		expect(kept(DAYDREAM_LIMITS.rawReply - 10, 11)).toBe(false);
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

describe('daydreamMarkKind', () => {
	it('fits a picture carrying both its prompts at their longest', () => {
		const picture = {
			type: 'picture' as const,
			imageId: '00000000-0000-4000-8000-0000000000aa',
			key: `AGE-SECRET-KEY-1${'Q'.repeat(58)}`,
			mimeType: 'image/webp' as const,
			width: 832,
			height: 1216,
			sent: {
				model: 'm'.repeat(200),
				// Quotes, the worst for JSON's escaping.
				positivePrompt: '"'.repeat(MAX_PICTURE_REQUEST_PROMPT),
				negativePrompt: '"'.repeat(MAX_PICTURE_REQUEST_PROMPT)
			}
		};
		expect(daydreamMarkKind.latest.safeParse(picture).success).toBe(true);
		const bytes = new TextEncoder().encode(JSON.stringify(picture)).length;
		expect(sealedLength(bytes)).toBeLessThanOrEqual(daydreamMarkKind.maxCiphertextLength);
	});
});
