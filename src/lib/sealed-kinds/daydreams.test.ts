import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
	CHARACTER_FIELD_KINDS,
	DAYDREAM_LIMITS,
	type FieldKind,
	fieldCap,
	IDEA_FIELD_KINDS,
	knownField,
	MAX_DAYDREAM_CHARACTERS,
	MAX_FIELDS,
	MAX_OPENINGS,
	MAX_SUGGESTIONS,
	MAX_TRACKERS,
	UNSET_CHARACTER_DIALS
} from '../daydream';
import { EXCHANGE_LIMITS } from '../daydream/exchange';
import { MAX_PICTURE_REQUEST_PROMPT } from '../daydream/image-prompt';
import {
	daydreamCharacterKind,
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

const partId = (index: number) => `0000000${index}-0000-4000-8000-000000000000`;
const ownId = (index: number) => `0000000${index}-0000-4000-8000-0000000000f0`;

/**
 * As many fields as a record holds, each at its cap: every known kind, then
 * fields the user named, at the longest a named field may be.
 */
function fullFields<Kind extends FieldKind>(kinds: readonly Kind[], of: 'character' | 'idea') {
	const known = kinds.map((kind) => knownField(kind, 'k'.repeat(fieldCap(kind, of))));
	const own = Array.from({ length: MAX_FIELDS - known.length }, (_, index) => ({
		id: ownId(index),
		kind: null,
		label: 'l'.repeat(DAYDREAM_LIMITS.fieldLabel),
		value: 'v'.repeat(DAYDREAM_LIMITS.customField),
		spoiler: index % 2 === 0
	}));
	return [...known, ...own];
}

/** A character with every field at its cap. */
const fullCharacter = (index: number) => ({
	name: `${index}`.repeat(DAYDREAM_LIMITS.characterName),
	archetype: 'a'.repeat(DAYDREAM_LIMITS.archetype),
	appearance: 'a'.repeat(DAYDREAM_LIMITS.appearance),
	fields: fullFields(CHARACTER_FIELD_KINDS, 'character'),
	dials: UNSET_CHARACTER_DIALS
});

/** An idea with every field at its cap, the brief, research, openings and trackers included. */
const fullIdea = (part: (index: number) => string) => ({
	title: 't'.repeat(DAYDREAM_LIMITS.title),
	premise: 'p'.repeat(DAYDREAM_LIMITS.premise),
	yourRole: 'y'.repeat(DAYDREAM_LIMITS.yourRole),
	fields: fullFields(IDEA_FIELD_KINDS, 'idea'),
	brief: 'b'.repeat(DAYDREAM_LIMITS.brief),
	research: 'r'.repeat(DAYDREAM_LIMITS.ideaResearch),
	parts: Array.from({ length: MAX_DAYDREAM_CHARACTERS }, (_, index) => ({
		id: part(index),
		name: 'n'.repeat(DAYDREAM_LIMITS.partName),
		description: 'd'.repeat(DAYDREAM_LIMITS.partDescription)
	})),
	openings: Array.from({ length: MAX_OPENINGS }, (_, index) => ({
		id: `0000000${index}-0000-4000-8000-0000000000e0`,
		label: 'o'.repeat(DAYDREAM_LIMITS.openingLabel),
		situation: 's'.repeat(DAYDREAM_LIMITS.openingSituation)
	})),
	trackers: Array.from({ length: MAX_TRACKERS }, (_, index) => ({
		id: `0000000${index}-0000-4000-8000-0000000000d0`,
		name: `${index}`.repeat(DAYDREAM_LIMITS.trackerName),
		kind: 'list',
		start: 's'.repeat(DAYDREAM_LIMITS.trackerStart),
		about: 'a'.repeat(DAYDREAM_LIMITS.trackerAbout)
	})),
	dials: { heat: 5, kink: 5 }
});

describe('daydreamCharacterKind', () => {
	it('fits a character at every cap inside its ciphertext cap', () => {
		const character = fullCharacter(1);
		expect(daydreamCharacterKind.latest.safeParse(character).success).toBe(true);
		expect(sealedLength(encodedLength(character))).toBeLessThanOrEqual(
			daydreamCharacterKind.maxCiphertextLength
		);
	});

	it('refuses a field the user named with no name, and one past its cap', () => {
		const character = fullCharacter(1);
		const unnamed = character.fields.map((field) =>
			field.kind === null ? { ...field, label: '' } : field
		);
		expect(daydreamCharacterKind.latest.safeParse({ ...character, fields: unnamed }).success).toBe(
			false
		);
		const long = character.fields.map((field) =>
			field.kind === 'speech' ? { ...field, value: `${field.value}x` } : field
		);
		expect(daydreamCharacterKind.latest.safeParse({ ...character, fields: long }).success).toBe(
			false
		);
	});

	it('refuses a known field under any id but its own', () => {
		const character = fullCharacter(1);
		const moved = character.fields.map((field) =>
			field.kind === 'personality' ? { ...field, id: ownId(9) } : field
		);
		expect(daydreamCharacterKind.latest.safeParse({ ...character, fields: moved }).success).toBe(
			false
		);
	});
});

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
				...fullCharacter(index),
				casting: {
					partId: partId(index),
					relationship: 'r'.repeat(DAYDREAM_LIMITS.relationship),
					part: 'p'.repeat(DAYDREAM_LIMITS.castPart)
				}
			})),
			idea: { ...fullIdea(partId), sourceId: null, sourceRevision: null },
			lead: 'character',
			limits: 'l'.repeat(DAYDREAM_LIMITS.limits),
			dials: { intensity: 3, pace: 3, length: 'medium', thoughts: 'hidden' },
			pictures: { on: true, style: 'photo' },
			opening: '00000000-0000-4000-8000-0000000000e0'
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
