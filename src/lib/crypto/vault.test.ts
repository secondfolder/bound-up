import { describe, expect, it } from 'vitest';
import { fromBase64, toBase64, toBase64Url } from '../encryption';
import { ADA_IDENTITY, ADA_RECIPIENT, JUN_IDENTITY, JUN_RECIPIENT } from '../testing/crypto';
import { importIdentityKey, loadAge } from './identity';
import {
	blindIndex,
	deriveVaultKeys,
	generateVaultKey,
	openVaultWrap,
	unwrapSelfVaultKey,
	unwrapVaultKey,
	vaultFromKey,
	wrapSelfVaultKey,
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
/** The self-wrap MAC for `FROZEN_RAW` in `VAULT_ID`, under Ada's identity: X25519 of the identity with its own recipient, HKDF, HMAC. */
const FROZEN_SELF_MAC = 'DDHKx2rS1nCPeCqrMNz-LfbG5PAv96qJqIECYmW8MjM';

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

	it('MACs a self vault’s wrap under the identity’s agreement with itself', async () => {
		const ciphertext = await wrapSelfVaultKey({
			vaultId: VAULT_ID,
			raw: FROZEN_RAW.slice(),
			identity: ADA_IDENTITY,
			recipient: ADA_RECIPIENT
		});
		expect(await payloadOf(ciphertext, ADA_IDENTITY)).toMatchObject({
			v: 2,
			mac: FROZEN_SELF_MAC
		});
	});
});

/** What is inside a wrap, read the way the server never can. */
async function payloadOf(ciphertext: string, identity: string): Promise<Record<string, unknown>> {
	const age = await loadAge();
	const decrypter = new age.Decrypter();
	decrypter.addIdentity(identity);
	return JSON.parse(await decrypter.decrypt(fromBase64(ciphertext), 'text'));
}

/** A wrap as a server could make one: any payload, encrypted to a public recipient. */
async function forgedWrap(payload: object, recipient: string): Promise<string> {
	const age = await loadAge();
	const encrypter = new age.Encrypter();
	encrypter.addRecipient(recipient);
	return toBase64(await encrypter.encrypt(new TextEncoder().encode(JSON.stringify(payload))));
}

describe('wrapping the self vault’s key', () => {
	async function newSelfVault() {
		const raw = generateVaultKey();
		const { keyCheck } = await deriveVaultKeys(raw);
		return { raw, vault: { id: VAULT_ID, keyCheck } };
	}

	it('opens for its owner, with either form of their identity', async () => {
		const { raw, vault } = await newSelfVault();
		const ciphertext = await wrapSelfVaultKey({
			vaultId: VAULT_ID,
			raw,
			identity: ADA_IDENTITY,
			recipient: ADA_RECIPIENT
		});
		for (const identity of [ADA_IDENTITY, await importIdentityKey(ADA_IDENTITY)]) {
			const opened = await unwrapSelfVaultKey({
				ciphertext,
				identity,
				recipient: ADA_RECIPIENT,
				vault
			});
			expect(opened?.legacy).toBe(false);
			expect(opened?.raw).toEqual(raw);
		}
	});

	/** The attack the MAC exists for: a vault the server made, wrapped to the user. */
	it('refuses a vault the server made up, though it opens and its fingerprint matches', async () => {
		const { raw, vault } = await newSelfVault();
		const ciphertext = await forgedWrap(
			{ v: 2, vaultId: VAULT_ID, key: toBase64Url(raw), mac: toBase64Url(new Uint8Array(32)) },
			ADA_RECIPIENT
		);
		expect(
			await unwrapSelfVaultKey({
				ciphertext,
				identity: ADA_IDENTITY,
				recipient: ADA_RECIPIENT,
				vault
			})
		).toBeNull();
	});

	it('refuses a wrap someone else MACed and encrypted to the owner', async () => {
		const { raw, vault } = await newSelfVault();
		const junsMac = (await payloadOf(
			await wrapSelfVaultKey({
				vaultId: VAULT_ID,
				raw,
				identity: JUN_IDENTITY,
				recipient: JUN_RECIPIENT
			}),
			JUN_IDENTITY
		)) as { mac: string };
		const ciphertext = await forgedWrap(
			{ v: 2, vaultId: VAULT_ID, key: toBase64Url(raw), mac: junsMac.mac },
			ADA_RECIPIENT
		);
		expect(
			await unwrapSelfVaultKey({
				ciphertext,
				identity: ADA_IDENTITY,
				recipient: ADA_RECIPIENT,
				vault
			})
		).toBeNull();
	});

	it('refuses its MAC for a different vault', async () => {
		const { raw, vault } = await newSelfVault();
		const ciphertext = await wrapSelfVaultKey({
			vaultId: VAULT_ID,
			raw,
			identity: ADA_IDENTITY,
			recipient: ADA_RECIPIENT
		});
		expect(
			await unwrapSelfVaultKey({
				ciphertext,
				identity: ADA_IDENTITY,
				recipient: ADA_RECIPIENT,
				vault: { ...vault, id: OTHER_VAULT_ID }
			})
		).toBeNull();
	});

	it('opens a wrap from before the MAC as legacy, so it can be upgraded', async () => {
		const { raw, vault } = await newSelfVault();
		const ciphertext = await wrapVaultKey({ vaultId: VAULT_ID, raw, recipient: ADA_RECIPIENT });
		const opened = await unwrapSelfVaultKey({
			ciphertext,
			identity: ADA_IDENTITY,
			recipient: ADA_RECIPIENT,
			vault
		});
		expect(opened?.legacy).toBe(true);
	});

	it('cannot be opened as a partnership vault’s wrap, which skips the MAC', async () => {
		const { raw, vault } = await newSelfVault();
		const ciphertext = await wrapSelfVaultKey({
			vaultId: VAULT_ID,
			raw,
			identity: ADA_IDENTITY,
			recipient: ADA_RECIPIENT
		});
		expect(await unwrapVaultKey({ ciphertext, identity: ADA_IDENTITY, vault })).toBeNull();
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
