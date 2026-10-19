import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
	defineSealedKind,
	isKnownVersion,
	readSealedPayload,
	readSealedPayloadDiagnosed,
	sealedAad
} from './sealed';

const v1 = z.object({ name: z.string() });
const v2 = z.object({ first: z.string(), last: z.string() });
const v3 = z.object({ first: z.string(), last: z.string(), pronouns: z.string().nullable() });

/** A rename-and-split, then an additive change: the two shapes upcasters exist for. */
const person = defineSealedKind({
	name: 'person',
	maxCiphertextLength: 1000,
	versions: [
		{
			version: 1,
			schema: v1,
			upcast: (value: z.output<typeof v1>) => {
				const [first = '', ...rest] = value.name.split(' ');
				return { first, last: rest.join(' ') };
			}
		},
		{
			version: 2,
			schema: v2,
			upcast: (value: z.output<typeof v2>) => ({ ...value, pronouns: null })
		},
		{ version: 3, schema: v3 }
	]
});

describe('readSealedPayload', () => {
	it('upcasts every shipped version to the latest, one step at a time', () => {
		expect(readSealedPayload(person, 1, { name: 'Ada Lovelace' })).toEqual({
			first: 'Ada',
			last: 'Lovelace',
			pronouns: null
		});
		expect(readSealedPayload(person, 2, { first: 'Jun', last: 'Ito' })).toEqual({
			first: 'Jun',
			last: 'Ito',
			pronouns: null
		});
		const latest = { first: 'Sam', last: 'Lee', pronouns: 'they' };
		expect(readSealedPayload(person, 3, latest)).toEqual(latest);
	});

	it('returns null for a version this build never shipped', () => {
		expect(readSealedPayload(person, 4, {})).toBeNull();
		expect(readSealedPayload(person, 0, {})).toBeNull();
	});

	/** Whatever comes out of a vault is untrusted: parsed, never cast. */
	it('returns null when a payload does not match its own version', () => {
		expect(readSealedPayload(person, 1, { first: 'Ada' })).toBeNull();
		expect(readSealedPayload(person, 3, { first: 'Ada', last: 'L' })).toBeNull();
		expect(readSealedPayload(person, 2, 'not an object')).toBeNull();
	});

	it('strips keys the schema does not declare, so a record cannot carry extra data', () => {
		expect(readSealedPayload(person, 3, { first: 'A', last: 'B', pronouns: null, x: 1 })).toEqual({
			first: 'A',
			last: 'B',
			pronouns: null
		});
	});

	it('validates an upcaster’s output against the next version', () => {
		const broken = defineSealedKind({
			name: 'broken',
			maxCiphertextLength: 1000,
			versions: [
				{ version: 1, schema: z.object({ a: z.string() }), upcast: () => ({ wrong: true }) },
				{ version: 2, schema: z.object({ b: z.string() }) }
			]
		});
		expect(readSealedPayload(broken, 1, { a: 'x' })).toBeNull();
	});
});

describe('defineSealedKind', () => {
	it('insists on versions 1, 2, 3… in order', () => {
		expect(() =>
			defineSealedKind({
				name: 'gappy',
				maxCiphertextLength: 1,
				versions: [
					{ version: 1, schema: z.object({}), upcast: (value: object) => value },
					{ version: 3, schema: z.object({}) }
				]
			})
		).toThrow('versions must be 1, 2, 3');
	});

	it('insists every version but the latest has an upcast', () => {
		expect(() =>
			defineSealedKind({
				name: 'stuck',
				maxCiphertextLength: 1,
				versions: [
					{ version: 1, schema: z.object({}) },
					{ version: 2, schema: z.object({}) }
				]
			})
		).toThrow('version 1 needs an upcast');
	});

	/** The name is part of the associated data, so it has to be safe to join. */
	it('refuses a name that could break the associated data', () => {
		expect(() =>
			defineSealedKind({
				name: 'a|b',
				maxCiphertextLength: 1,
				versions: [{ version: 1, schema: z.object({}) }]
			})
		).toThrow('lowercase letters, digits and dashes');
	});
});

describe('isKnownVersion', () => {
	it('knows exactly the shipped versions', () => {
		expect([0, 1, 2, 3, 4].map((version) => isKnownVersion(person, version))).toEqual([
			false,
			true,
			true,
			true,
			false
		]);
	});
});

describe('sealedAad', () => {
	/** Frozen: every sealed record was bound to this exact string. */
	it('joins its parts in a fixed order', () => {
		expect(sealedAad({ kind: 'task', recordId: 'r', vaultId: 'v', version: 2 })).toBe(
			'bound-up-sealed-v1|task|r|v|2'
		);
	});
});

describe('readSealedPayloadDiagnosed', () => {
	it('says where a schema refused a payload, what it wanted, and the type it got, never the value', () => {
		const read = readSealedPayloadDiagnosed(person, 3, {
			first: 42,
			last: 'Secret surname',
			pronouns: ['they']
		});
		expect(read).toEqual({
			ok: false,
			reason: 'schema',
			version: 3,
			issues: [
				{ path: 'first', code: 'invalid_type', expected: 'string', received: 'number' },
				{ path: 'pronouns', code: 'invalid_type', expected: 'string', received: 'array' }
			]
		});
		expect(JSON.stringify(read)).not.toContain('Secret');
	});

	it('names the values an enum allows', () => {
		const kind = defineSealedKind({
			name: 'level',
			maxCiphertextLength: 100,
			versions: [{ version: 1, schema: z.object({ level: z.enum(['like', 'love']) }) }]
		});
		const read = readSealedPayloadDiagnosed(kind, 1, { level: 3 });
		expect(read.ok === false && read.reason === 'schema' && read.issues).toEqual([
			{
				path: 'level',
				code: 'invalid_value',
				expected: 'one of "like", "love"',
				received: 'number'
			}
		]);
	});
});
