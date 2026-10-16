/**
 * The escrow of a user's own vault key: sealing it under the server's share,
 * and passing it between age layers.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 *     inner  = 12-byte IV ‖ AES-256-GCM_share(vault key) ‖ tag,  AAD = escrowAad(vault)
 *     escrow = age(inner) → the partner's recipient
 *     relay  = age(inner) → the account's new recipient, made by the partner
 *
 * The share is 32 bytes the server derives from the escrow's id and never
 * stores (`escrowShare` in `server/vaults.ts`). The partner can open the
 * outer layer and gets only `inner`; the server has the share but not the
 * partner's key. See docs/encryption.md, "Escrow".
 */

import { fromBase64, toBase64 } from '../encryption';
import { ESCROW_SHARE_PATTERN, escrowAad, VAULT_KEY_BYTES } from '../vault';
import { loadAge } from './identity';
import { deriveVaultKeys } from './vault';

const IV_BYTES = 12;
const encoder = new TextEncoder();

function shareBytes(share: string): Uint8Array<ArrayBuffer> {
	if (!ESCROW_SHARE_PATTERN.test(share)) {
		throw new Error('Not an escrow share');
	}
	const bytes = new Uint8Array(32);
	for (let i = 0; i < 32; i += 1) {
		bytes[i] = Number.parseInt(share.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

async function shareKey(share: string): Promise<CryptoKey> {
	return await crypto.subtle.importKey('raw', shareBytes(share), 'AES-GCM', false, [
		'encrypt',
		'decrypt'
	]);
}

/** The vault key sealed under the server's share. */
export async function sealUnderShare(input: {
	raw: Uint8Array<ArrayBuffer>;
	share: string;
	vault: { id: string; keyCheck: string };
}): Promise<Uint8Array<ArrayBuffer>> {
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const sealed = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv,
			additionalData: encoder.encode(escrowAad(input.vault.id, input.vault.keyCheck))
		},
		await shareKey(input.share),
		input.raw
	);
	const inner = new Uint8Array(IV_BYTES + sealed.byteLength);
	inner.set(iv, 0);
	inner.set(new Uint8Array(sealed), IV_BYTES);
	return inner;
}

/**
 * The vault key back out of `inner`, or null when the share, the vault or the
 * key check does not match. Checking the key against the vault's fingerprint
 * is what stops a forged relay from planting a key the server chose.
 */
export async function openUnderShare(input: {
	inner: Uint8Array<ArrayBuffer>;
	share: string;
	vault: { id: string; keyCheck: string };
}): Promise<Uint8Array<ArrayBuffer> | null> {
	if (input.inner.length <= IV_BYTES) {
		return null;
	}
	let raw: Uint8Array<ArrayBuffer>;
	try {
		raw = new Uint8Array(
			await crypto.subtle.decrypt(
				{
					name: 'AES-GCM',
					iv: input.inner.subarray(0, IV_BYTES),
					additionalData: encoder.encode(escrowAad(input.vault.id, input.vault.keyCheck))
				},
				await shareKey(input.share),
				input.inner.subarray(IV_BYTES)
			)
		);
	} catch {
		return null;
	}
	if (raw.length !== VAULT_KEY_BYTES) {
		return null;
	}
	const { keyCheck } = await deriveVaultKeys(raw);
	return keyCheck === input.vault.keyCheck ? raw : null;
}

/** Raw bytes, age-encrypted to one recipient, as standard base64. */
export async function encryptBytesTo(bytes: Uint8Array, recipient: string): Promise<string> {
	const age = await loadAge();
	const encrypter = new age.Encrypter();
	encrypter.addRecipient(recipient);
	return toBase64(await encrypter.encrypt(bytes));
}

/** The inverse, or null when this identity cannot open it. */
export async function decryptBytes(
	ciphertext: string,
	identity: CryptoKey | string
): Promise<Uint8Array<ArrayBuffer> | null> {
	const age = await loadAge();
	const decrypter = new age.Decrypter();
	decrypter.addIdentity(identity);
	try {
		const opened = await decrypter.decrypt(fromBase64(ciphertext), 'uint8array');
		return new Uint8Array(opened);
	} catch {
		return null;
	}
}
