import { describe, expect, it, vi } from 'vitest';
import { ADA_IDENTITY, ADA_RECIPIENT } from '../testing/crypto';
import { deriveVaultKeys } from './vault';

// A browser with no X25519 in WebCrypto, where the identity is held as a
// string and the self-wrap MAC key comes from @noble/curves instead. A file of
// its own because the module mock applies to the whole file.
vi.mock('./identity', async (importOriginal) => ({
	...(await importOriginal<typeof import('./identity')>()),
	webCryptoX25519Available: () => Promise.resolve(false)
}));

const { unwrapSelfVaultKey, wrapSelfVaultKey } = await import('./vault');

describe('the self vault’s wrap without WebCrypto X25519', () => {
	it('makes the same MAC, so a wrap from either kind of browser opens on the other', async () => {
		const raw = new Uint8Array(Array.from({ length: 32 }, (_, i) => i));
		const { keyCheck } = await deriveVaultKeys(raw.slice());
		const vaultId = '00000000-0000-4000-8000-000000000001';
		const ciphertext = await wrapSelfVaultKey({
			vaultId,
			raw: raw.slice(),
			identity: ADA_IDENTITY,
			recipient: ADA_RECIPIENT
		});
		const opened = await unwrapSelfVaultKey({
			ciphertext,
			identity: ADA_IDENTITY,
			recipient: ADA_RECIPIENT,
			vault: { id: vaultId, keyCheck }
		});
		expect(opened?.legacy).toBe(false);

		// The frozen vector in vault.test.ts, made through WebCrypto.
		const age = await import('age-encryption');
		const decrypter = new age.Decrypter();
		decrypter.addIdentity(ADA_IDENTITY);
		const { fromBase64 } = await import('../encryption');
		const payload = JSON.parse(await decrypter.decrypt(fromBase64(ciphertext), 'text'));
		expect(payload.mac).toBe('DDHKx2rS1nCPeCqrMNz-LfbG5PAv96qJqIECYmW8MjM');
	});
});
