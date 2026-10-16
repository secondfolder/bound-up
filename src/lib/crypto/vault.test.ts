import { describe, expect, it } from 'vitest';
import { ADA_IDENTITY, ADA_RECIPIENT, JUN_IDENTITY, JUN_RECIPIENT } from '../testing/crypto';
import { importIdentityKey } from './identity';
import {
	blindIndex,
	deriveVaultKeys,
	generateVaultKey,
	openVaultWrap,
	unwrapVaultKey,
	vaultFromKey,
	wrapVaultKey
} from './vault';

/**
 * Frozen vectors, made by an independent implementation on `node:crypto`
 * (HKDF-SHA256 with no salt, then HMAC-SHA256), not by this module. Every
 * vault's key check and every blind index ever stored was made with these
 * `info` strings; if one moved, nothing would fail locally — existing vaults
 * would just stop matching their own fingerprint on every device. Never
 * regenerate these to make a failure go away.
 */
const FROZEN_RAW = new Uint8Array(Array.from({ length: 32 }, (_, i) => i));
const FROZEN_KEY_CHECK = 'NICWrS7jCZHy2vOvciodDV26dBU8CKbHBJfGoAz-GhA';
const FROZEN_INDEX = 'YlNOfviou6KraK_BWzEyGZwDcRqR5tiazY0F5i0-ves';

const VAULT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_VAULT_ID = '00000000-0000-4000-8000-0000000000ff';
const row = { id: VAULT_ID, kind: 'partnership' as const, partnershipId: 'p1' };

describe('frozen vectors', () => {
	it('derives the key check with HKDF and the versioned info string', async () => {
		const { keyCheck } = await deriveVaultKeys(FROZEN_RAW.slice());
		expect(keyCheck).toBe(FROZEN_KEY_CHECK);
	});

	it('derives a blind index per purpose', async () => {
		const vault = await vaultFromKey(FROZEN_RAW.slice(), row);
		expect(await blindIndex(vault, 'tag|name', 'kink')).toBe(FROZEN_INDEX);
	});
});

describe('wrapping a vault key', () => {
	it('opens for the member it was wrapped to, and nobody else', async () => {
		const raw = generateVaultKey();
		const { keyCheck } = await deriveVaultKeys(raw);
		const vault = { ...row, keyCheck };
		const ciphertext = await wrapVaultKey({ vaultId: VAULT_ID, raw, recipient: ADA_RECIPIENT });

		const opened = await openVaultWrap({ ciphertext, identity: ADA_IDENTITY, vault });
		expect(opened?.keyCheck).toBe(keyCheck);
		expect(await openVaultWrap({ ciphertext, identity: JUN_IDENTITY, vault })).toBeNull();
	});

	it('opens with the non-extractable form of the identity too', async () => {
		const raw = generateVaultKey();
		const { keyCheck } = await deriveVaultKeys(raw);
		const ciphertext = await wrapVaultKey({ vaultId: VAULT_ID, raw, recipient: JUN_RECIPIENT });
		const identity = await importIdentityKey(JUN_IDENTITY);
		expect(
			await unwrapVaultKey({ ciphertext, identity, vault: { id: VAULT_ID, keyCheck } })
		).toEqual(raw);
	});

	/** A real wrap paired with the wrong vault row, by a server or by accident. */
	it('refuses a wrap for a different vault', async () => {
		const raw = generateVaultKey();
		const { keyCheck } = await deriveVaultKeys(raw);
		const ciphertext = await wrapVaultKey({ vaultId: VAULT_ID, raw, recipient: ADA_RECIPIENT });
		expect(
			await unwrapVaultKey({
				ciphertext,
				identity: ADA_IDENTITY,
				vault: { id: OTHER_VAULT_ID, keyCheck }
			})
		).toBeNull();
	});

	/** A vault row whose fingerprint is not the key's: a made-up vault, or a swapped one. */
	it('refuses a key whose fingerprint is not the vault row', async () => {
		const raw = generateVaultKey();
		const other = await deriveVaultKeys(generateVaultKey());
		const ciphertext = await wrapVaultKey({ vaultId: VAULT_ID, raw, recipient: ADA_RECIPIENT });
		expect(
			await unwrapVaultKey({
				ciphertext,
				identity: ADA_IDENTITY,
				vault: { id: VAULT_ID, keyCheck: other.keyCheck }
			})
		).toBeNull();
	});

	it('returns null rather than throwing for something that is not a wrap', async () => {
		expect(
			await unwrapVaultKey({
				ciphertext: 'bm90IGFnZQ==',
				identity: ADA_IDENTITY,
				vault: { id: VAULT_ID, keyCheck: FROZEN_KEY_CHECK }
			})
		).toBeNull();
	});
});

describe('derived keys', () => {
	it('cannot be exported', async () => {
		const { encryptionKey, indexBase } = await deriveVaultKeys(generateVaultKey());
		expect(encryptionKey.extractable).toBe(false);
		expect(indexBase.extractable).toBe(false);
	});

	it('gives different indexes for different purposes and different vaults', async () => {
		const a = await vaultFromKey(generateVaultKey(), row);
		const b = await vaultFromKey(generateVaultKey(), row);
		const tag = await blindIndex(a, 'tag|name', 'same');
		expect(await blindIndex(a, 'tag|name', 'same')).toBe(tag);
		expect(await blindIndex(a, 'folder|name', 'same')).not.toBe(tag);
		expect(await blindIndex(b, 'tag|name', 'same')).not.toBe(tag);
	});
});
