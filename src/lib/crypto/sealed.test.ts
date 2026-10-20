import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineSealedKind } from '../sealed';
import { needsUpgrade, openRecord, sealRecord } from './sealed';
import { generateVaultKey, type OpenVault, vaultFromKey } from './vault';
import { issueWriteGrant, selfWriteGrant } from './write-grant';

/**
 * A kind that exists only for these tests, with two versions so the upcast
 * path is exercised: v1 had one `title`, v2 split out a `note`.
 */
const testNote = defineSealedKind({
	name: 'test-note',
	maxCiphertextLength: 4096,
	versions: [
		{
			version: 1,
			schema: z.object({ title: z.string() }),
			upcast: (value: { title: string }) => ({ title: value.title, note: '' })
		},
		{ version: 2, schema: z.object({ title: z.string().min(1), note: z.string() }) }
	]
});

const VAULT_ID = '00000000-0000-4000-8000-000000000001';
const RECORD_ID = '00000000-0000-4000-8000-000000000002';
const OTHER_ID = '00000000-0000-4000-8000-000000000003';

async function vault(id = VAULT_ID, raw = generateVaultKey()): Promise<OpenVault> {
	return await vaultFromKey(raw, { id, kind: 'self', partnershipId: null });
}

/**
 * Made by an independent implementation on `node:crypto`: AES-256-GCM under
 * HKDF(key 0..31, "bound-up-vault-enc-v1"), IV 100..111, associated data
 * "bound-up-sealed-v1|test-note|<record>|<vault>|1", over `{"title":"frozen"}`.
 * It pins the envelope, the prefix and the associated data all at once. Never
 * regenerate it to make a failure go away.
 */
const FROZEN_V1 = 'sb1.ZGVmZ2hpamtsbW5vF2zmBPQHr9uzKv8Tu1bL9DIbkAissn73dSHaPOT_eMgoew';
const frozenVault = () => vault(VAULT_ID, new Uint8Array(Array.from({ length: 32 }, (_, i) => i)));

describe('frozen vector', () => {
	it('opens a v1 record sealed by an independent implementation, upcast to v2', async () => {
		const opened = await openRecord(testNote, {
			recordId: RECORD_ID,
			ciphertext: FROZEN_V1,
			payloadVersion: 1,
			vault: await frozenVault()
		});
		expect(opened).toEqual({ title: 'frozen', note: '' });
	});
});

describe('sealRecord / openRecord', () => {
	it('round-trips at the latest version', async () => {
		const v = await vault();
		const sealed = await sealRecord(testNote, {
			recordId: RECORD_ID,
			payload: { title: 'hello', note: 'world' },
			vault: v,
			grant: selfWriteGrant(v)
		});
		expect(sealed.payloadVersion).toBe(2);
		expect(sealed.ciphertext.startsWith('sb1.')).toBe(true);
		expect(await openRecord(testNote, { recordId: RECORD_ID, vault: v, ...sealed })).toEqual({
			title: 'hello',
			note: 'world'
		});
	});

	it('never seals the same payload to the same ciphertext', async () => {
		const v = await vault();
		const input = {
			recordId: RECORD_ID,
			payload: { title: 'same', note: '' },
			vault: v,
			grant: selfWriteGrant(v)
		};
		const a = await sealRecord(testNote, input);
		const b = await sealRecord(testNote, input);
		expect(a.ciphertext).not.toBe(b.ciphertext);
	});

	describe('refuses a ciphertext the server has moved or relabelled', () => {
		async function sealed() {
			const v = await vault();
			const result = await sealRecord(testNote, {
				recordId: RECORD_ID,
				payload: { title: 'mine', note: '' },
				vault: v,
				grant: selfWriteGrant(v)
			});
			return { v, ...result };
		}

		it('to another row', async () => {
			const { v, ciphertext, payloadVersion } = await sealed();
			expect(
				await openRecord(testNote, { recordId: OTHER_ID, ciphertext, payloadVersion, vault: v })
			).toBeNull();
		});

		it('to another vault, even one holding the same key', async () => {
			const raw = generateVaultKey();
			const v = await vault(VAULT_ID, raw.slice());
			const twin = await vault(OTHER_ID, raw.slice());
			const { ciphertext, payloadVersion } = await sealRecord(testNote, {
				recordId: RECORD_ID,
				payload: { title: 'mine', note: '' },
				vault: v,
				grant: selfWriteGrant(v)
			});
			expect(
				await openRecord(testNote, { recordId: RECORD_ID, ciphertext, payloadVersion, vault: twin })
			).toBeNull();
		});

		it('to another kind', async () => {
			const other = defineSealedKind({
				name: 'test-other',
				maxCiphertextLength: 4096,
				versions: [{ version: 1, schema: z.object({ title: z.string(), note: z.string() }) }]
			});
			const { v, ciphertext } = await sealed();
			expect(
				await openRecord(other, { recordId: RECORD_ID, ciphertext, payloadVersion: 1, vault: v })
			).toBeNull();
		});

		/** Downgrading the plaintext version so a record is read as an older shape. */
		it('with its version edited', async () => {
			const { v, ciphertext } = await sealed();
			expect(
				await openRecord(testNote, { recordId: RECORD_ID, ciphertext, payloadVersion: 1, vault: v })
			).toBeNull();
		});

		it('with a byte flipped', async () => {
			const { v, ciphertext, payloadVersion } = await sealed();
			const last = ciphertext.at(-1) === 'A' ? 'B' : 'A';
			const flipped = `${ciphertext.slice(0, -1)}${last}`;
			expect(
				await openRecord(testNote, {
					recordId: RECORD_ID,
					ciphertext: flipped,
					payloadVersion,
					vault: v
				})
			).toBeNull();
		});
	});

	it('returns null for a different key, an unknown format and garbage', async () => {
		const v = await vault();
		const { ciphertext, payloadVersion } = await sealRecord(testNote, {
			recordId: RECORD_ID,
			payload: { title: 'x', note: '' },
			vault: v,
			grant: selfWriteGrant(v)
		});
		const stranger = await vault();
		const open = (text: string, using = v) =>
			openRecord(testNote, { recordId: RECORD_ID, ciphertext: text, payloadVersion, vault: using });
		expect(await open(ciphertext, stranger)).toBeNull();
		expect(await open(`sb9.${ciphertext.slice(4)}`)).toBeNull();
		expect(await open('sb1.!!!')).toBeNull();
		expect(await open('sb1.AAAA')).toBeNull();
	});

	it('refuses to seal a payload its own schema rejects', async () => {
		const v = await vault();
		await expect(
			sealRecord(testNote, {
				recordId: RECORD_ID,
				payload: { title: '', note: '' },
				vault: v,
				grant: selfWriteGrant(v)
			})
		).rejects.toThrow('does not match its own schema');
	});

	it('refuses a grant for a different vault', async () => {
		const v = await vault();
		await expect(
			sealRecord(testNote, {
				recordId: RECORD_ID,
				payload: { title: 'x', note: '' },
				vault: v,
				grant: issueWriteGrant(OTHER_ID)
			})
		).rejects.toThrow('different vault');
	});

	it('refuses a payload over the kind’s cap, before the server has to', async () => {
		const tiny = defineSealedKind({
			name: 'test-tiny',
			maxCiphertextLength: 64,
			versions: [{ version: 1, schema: z.object({ text: z.string() }) }]
		});
		const v = await vault();
		await expect(
			sealRecord(tiny, {
				recordId: RECORD_ID,
				payload: { text: 'x'.repeat(100) },
				vault: v,
				grant: selfWriteGrant(v)
			})
		).rejects.toThrow('over its 64-character cap');
	});
});

/** A compressed kind, as `daydream-exchange` is. */
const testLog = defineSealedKind({
	name: 'test-log',
	maxCiphertextLength: 4096,
	compressed: true,
	versions: [{ version: 1, schema: z.object({ body: z.string() }) }]
});

describe('a compressed kind', () => {
	it('deflates before sealing, under its own prefix, and opens to the same payload', async () => {
		const v = await vault();
		// Far longer than the cap uncompressed: only deflating fits it.
		const body = 'data: {"choices":[{"delta":{"content":"x"}}]}\n\n'.repeat(500);
		const sealed = await sealRecord(testLog, {
			recordId: RECORD_ID,
			payload: { body },
			vault: v,
			grant: selfWriteGrant(v)
		});
		expect(sealed.ciphertext.startsWith('sz1.')).toBe(true);
		expect(sealed.ciphertext.length).toBeLessThan(body.length / 10);
		expect(await openRecord(testLog, { recordId: RECORD_ID, vault: v, ...sealed })).toEqual({
			body
		});
	});

	it('opens nothing under the other kind of prefix, or that has been tampered with', async () => {
		const v = await vault();
		const sealed = await sealRecord(testLog, {
			recordId: RECORD_ID,
			payload: { body: 'hello' },
			vault: v,
			grant: selfWriteGrant(v)
		});
		const open = (ciphertext: string) =>
			openRecord(testLog, { recordId: RECORD_ID, vault: v, payloadVersion: 1, ciphertext });
		expect(await open(`sb1.${sealed.ciphertext.slice(4)}`)).toBeNull();
		const flipped =
			sealed.ciphertext.slice(0, -2) + (sealed.ciphertext.endsWith('A') ? 'BA' : 'AA');
		expect(await open(flipped)).toBeNull();
		// And an ordinary kind does not open a compressed one.
		expect(
			await openRecord(testNote, { recordId: RECORD_ID, vault: v, ...sealed, payloadVersion: 2 })
		).toBeNull();
	});
});

describe('selfWriteGrant', () => {
	it('will not grant a partnership vault, which needs the trust check', () => {
		expect(() => selfWriteGrant({ id: VAULT_ID, kind: 'partnership' })).toThrow('trust check');
	});
});

describe('needsUpgrade', () => {
	it('is true only below the latest version', () => {
		expect(needsUpgrade(testNote, 1)).toBe(true);
		expect(needsUpgrade(testNote, 2)).toBe(false);
	});
});
