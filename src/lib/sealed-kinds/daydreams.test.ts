import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DAYDREAM_LIMITS, MAX_SUGGESTIONS } from '../daydream';
import { EXCHANGE_LIMITS } from '../daydream/exchange';
import { MAX_PICTURE_REQUEST_PROMPT } from '../daydream/image-prompt';
import { daydreamExchangeKind, daydreamMarkKind, daydreamTurnKind } from './daydreams';

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
			raw: 'r'.repeat(DAYDREAM_LIMITS.rawReply),
			rawTruncated: true as const,
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

describe('daydreamExchangeKind', () => {
	/**
	 * Made-up words of random letters: harder to compress than real prose,
	 * so what fits here fits a real story with room to spare.
	 */
	function prose(characters: number, seed: number): string {
		let state = seed;
		const next = () => {
			state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
			return state;
		};
		let text = '';
		while (text.length < characters) {
			const length = 2 + (next() % 8);
			for (let letter = 0; letter < length; letter += 1) {
				text += 'etaoinshrdlucmfwypvbgk'[next() % 22];
			}
			text += next() % 9 === 0 ? '. ' : ' ';
		}
		return text.slice(0, characters);
	}

	it('fits a long story’s request and a reasoning reply’s stream, compressed, well inside its cap', () => {
		const messages = [
			{ role: 'system', content: prose(24_000, 1) },
			...Array.from({ length: 60 }, (_, index) => ({
				role: index % 2 === 0 ? 'assistant' : 'user',
				content: prose(1000, index + 2)
			}))
		];
		const request = JSON.stringify({
			model: 'z-ai/glm-4.6',
			messages,
			stream: true,
			max_tokens: 1200
		});
		// 2,400 events: reasoning and a reply, a word each, as OpenRouter streams them.
		const body = Array.from({ length: 2400 }, (_, index) => {
			const word = prose(8, index + 100);
			const delta = index < 1200 ? { reasoning: word } : { content: word };
			return `data: ${JSON.stringify({
				id: 'gen-1792500000-AbCdEfGhIjKlMnOp',
				object: 'chat.completion.chunk',
				created: 1_792_500_000,
				model: 'z-ai/glm-4.6',
				provider: 'Chutes',
				choices: [
					{ index: 0, delta, finish_reason: null, native_finish_reason: null, logprobs: null }
				]
			})}\n\n`;
		}).join('');
		const exchange = {
			endpoint: 'chat/completions' as const,
			request,
			response: { status: 200, body },
			ended: 'done' as const,
			startedAt: 0,
			endedAt: 1
		};
		expect(daydreamExchangeKind.latest.safeParse(exchange).success).toBe(true);
		const plain = new TextEncoder().encode(JSON.stringify(exchange));
		const sealed = sealedLength(deflateRawSync(plain).length);
		// About 800 KB of plaintext seals to about 60 KB: a small part of the cap.
		expect(plain.length).toBeGreaterThan(600_000);
		expect(sealed).toBeLessThan(daydreamExchangeKind.maxCiphertextLength / 8);
	});

	it('refuses a request or response past its cap', () => {
		const exchange = (request: number, response: number) =>
			daydreamExchangeKind.latest.safeParse({
				endpoint: 'chat/completions',
				request: 'r'.repeat(request),
				response: { status: 200, body: 'b'.repeat(response) },
				ended: 'done',
				startedAt: 0,
				endedAt: 1
			}).success;
		expect(exchange(EXCHANGE_LIMITS.request, EXCHANGE_LIMITS.response)).toBe(true);
		expect(exchange(EXCHANGE_LIMITS.request + 1, 0)).toBe(false);
		expect(exchange(1, EXCHANGE_LIMITS.response + 1)).toBe(false);
	});
});
