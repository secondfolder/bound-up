import { describe, expect, it } from 'vitest';
import { fromBase64 } from '../encryption';
import { ADA_IDENTITY, ADA_RECIPIENT, JUN_IDENTITY } from '../testing/crypto';
import { decryptBytes, encryptBytesTo, openUnderShare, sealUnderShare } from './escrow';
import { deriveVaultKeys, generateVaultKey } from './vault';

/**
 * Frozen, made by an independent implementation on `node:crypto`:
 * AES-256-GCM under share bytes 255…224, IV 200…211, associated data
 * "bound-up-escrow-v1|<vault id>|<key check>", over the vault key 0…31. Every
 * escrow ever stored is in this format; never regenerate it to pass.
 */
const FROZEN_SHARE = 'fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e0';
const FROZEN_INNER =
	'yMnKy8zNzs/Q0dLTGTu7Tp0sViww0o73V43wJAu6nLpTBScyBLqH3aEujm9Vc6s3Tw1UhbU/P0/8H1Ag';
const FROZEN_VAULT = {
	id: '00000000-0000-4000-8000-000000000001',
	keyCheck: 'NICWrS7jCZHy2vOvciodDV26dBU8CKbHBJfGoAz-GhA'
};

describe('frozen vector', () => {
	it('opens an inner layer sealed by an independent implementation', async () => {
		const raw = await openUnderShare({
			inner: fromBase64(FROZEN_INNER),
			share: FROZEN_SHARE,
			vault: FROZEN_VAULT
		});
		expect(raw).toEqual(new Uint8Array(Array.from({ length: 32 }, (_, i) => i)));
	});
});

describe('sealUnderShare / openUnderShare', () => {
	async function sealed() {
		const raw = generateVaultKey();
		const { keyCheck } = await deriveVaultKeys(raw.slice());
		const vault = { id: crypto.randomUUID(), keyCheck };
		const share = 'a1'.repeat(32);
		return { raw, vault, share, inner: await sealUnderShare({ raw, share, vault }) };
	}

	it('round-trips with the share', async () => {
		const { raw, vault, share, inner } = await sealed();
		await expect(openUnderShare({ inner, share, vault })).resolves.toEqual(raw);
	});

	it('opens nothing with a different share', async () => {
		const { vault, inner } = await sealed();
		await expect(openUnderShare({ inner, share: 'b2'.repeat(32), vault })).resolves.toBeNull();
	});

	/** An escrow passed off as some other vault's: its associated data does not match. */
	it('opens nothing for a different vault', async () => {
		const { vault, share, inner } = await sealed();
		await expect(
			openUnderShare({ inner, share, vault: { ...vault, id: crypto.randomUUID() } })
		).resolves.toBeNull();
	});

	it('refuses something that is not a share', async () => {
		const { raw, vault } = await sealed();
		await expect(sealUnderShare({ raw, share: 'not hex', vault })).rejects.toThrow('escrow share');
	});
});

describe('encryptBytesTo / decryptBytes', () => {
	it('opens for the recipient and nobody else', async () => {
		const bytes = new Uint8Array([1, 2, 3, 250]);
		const ciphertext = await encryptBytesTo(bytes, ADA_RECIPIENT);
		await expect(decryptBytes(ciphertext, ADA_IDENTITY)).resolves.toEqual(bytes);
		await expect(decryptBytes(ciphertext, JUN_IDENTITY)).resolves.toBeNull();
	});
});
