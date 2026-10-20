import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
	DAYDREAM_LIMITS,
	MAX_DAYDREAM_CHARACTERS,
	MAX_SUGGESTIONS,
	UNSET_CHARACTER_DIALS
} from '../daydream';
import { EXCHANGE_LIMITS } from '../daydream/exchange';
import { MAX_PICTURE_REQUEST_PROMPT } from '../daydream/image-prompt';
import {
	daydreamExchangeKind,
	daydreamIdeaKind,
	daydreamMarkKind,
	daydreamSetupKind,
	daydreamTurnKind
} from './daydreams';

/**
 * How long `sb1.` sealing makes a payload of `bytes`: a 12-byte IV and a
 * 16-byte tag around the ciphertext, base64url without padding
 * (`src/lib/sealed-fixtures/README.md`).
 */
const sealedLength = (bytes: number) => 'sb1.'.length + Math.ceil(((12 + bytes + 16) * 4) / 3);

/** An idea with every field at its cap, the brief and research included. */
const fullIdea = (part: (index: number) => string) => ({
	title: 't'.repeat(DAYDREAM_LIMITS.title),
	setting: 's'.repeat(DAYDREAM_LIMITS.setting),
	premise: 'p'.repeat(DAYDREAM_LIMITS.premise),
	yourRole: 'y'.repeat(DAYDREAM_LIMITS.yourRole),
	tone: 'o'.repeat(DAYDREAM_LIMITS.tone),
	notes: 'n'.repeat(DAYDREAM_LIMITS.ideaNotes),
	brief: 'b'.repeat(DAYDREAM_LIMITS.brief),
	research: 'r'.repeat(DAYDREAM_LIMITS.ideaResearch),
	parts: Array.from({ length: MAX_DAYDREAM_CHARACTERS }, (_, index) => ({
		id: part(index),
		name: 'n'.repeat(DAYDREAM_LIMITS.partName),
		description: 'd'.repeat(DAYDREAM_LIMITS.partDescription)
	})),
	dials: { heat: 5, kink: 5 }
});

const partId = (index: number) => `0000000${index}-0000-4000-8000-000000000000`;

const encodedLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

describe('daydreamIdeaKind', () => {
	it('fits an idea at every cap, brief and research included, inside its ciphertext cap', () => {
		const idea = fullIdea(partId);
		expect(daydreamIdeaKind.latest.safeParse(idea).success).toBe(true);
		expect(sealedLength(encodedLength(idea))).toBeLessThanOrEqual(
			daydreamIdeaKind.maxCiphertextLength
		);
	});

	it('refuses research past its cap', () => {
		const idea = { ...fullIdea(partId), research: 'r'.repeat(DAYDREAM_LIMITS.ideaResearch + 1) };
		expect(daydreamIdeaKind.latest.safeParse(idea).success).toBe(false);
	});
});

describe('daydreamSetupKind', () => {
	it('fits four characters and an idea at every cap inside its ciphertext cap', () => {
		const setup = {
			title: 't'.repeat(DAYDREAM_LIMITS.title),
			voice: { narrator: 'none', stance: 'self', protagonistName: '' },
			characters: Array.from({ length: MAX_DAYDREAM_CHARACTERS }, (_, index) => ({
				sourceId: null,
				sourceRevision: null,
				name: `${index}`.repeat(DAYDREAM_LIMITS.characterName),
				archetype: 'a'.repeat(DAYDREAM_LIMITS.archetype),
				personality: 'p'.repeat(DAYDREAM_LIMITS.personality),
				speech: 's'.repeat(DAYDREAM_LIMITS.speech),
				appearance: 'a'.repeat(DAYDREAM_LIMITS.appearance),
				likes: 'l'.repeat(DAYDREAM_LIMITS.likes),
				notes: 'n'.repeat(DAYDREAM_LIMITS.characterNotes),
				dials: UNSET_CHARACTER_DIALS,
				casting: {
					partId: partId(index),
					relationship: 'r'.repeat(DAYDREAM_LIMITS.relationship),
					part: 'p'.repeat(DAYDREAM_LIMITS.castPart)
				}
			})),
			idea: { ...fullIdea(partId), sourceId: null, sourceRevision: null },
			lead: 'character',
			limits: 'l'.repeat(DAYDREAM_LIMITS.limits),
			dials: { intensity: 3, pace: 3, length: 'medium' },
			pictures: { on: true, style: 'photo' }
		};
		expect(daydreamSetupKind.latest.safeParse(setup).success).toBe(true);
		expect(sealedLength(encodedLength(setup))).toBeLessThanOrEqual(
			daydreamSetupKind.maxCiphertextLength
		);
	});
});

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
