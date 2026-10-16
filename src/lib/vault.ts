/**
 * Vaults: the pure half. Types, constants and string formats, no cryptography.
 *
 * A vault is one random symmetric key per scope — one per user, one per
 * partnership — that the user data in that scope is sealed under. The key is
 * wrapped, age-encrypted, to the recipient of each member who may open it, so
 * a change of someone's key means re-wrapping one key rather than
 * re-encrypting everything in the scope. See docs/encryption.md.
 *
 * Alias-free (relative imports only), like `encryption.ts`: the Drizzle schema
 * imports `VaultKind` from here, and drizzle-kit loads the schema outside Vite.
 * The cryptography is in `crypto/vault.ts`, which is browser-only.
 */

import { toBase64Url } from './encryption';

/** Which scope a vault belongs to. Exactly one of its owner columns is set to match. */
export type VaultKind = 'self' | 'partnership';

/** A vault key is 256 random bits. */
export const VAULT_KEY_BYTES = 32;

/**
 * HKDF `info` strings. The vault key is never used directly: everything is
 * derived from it, each with its own `info`, so one key yields unrelated keys
 * for unrelated jobs and none of them can be turned back into another.
 */
export const VAULT_ENCRYPTION_INFO = 'bound-up-vault-enc-v1';
export const VAULT_KEY_CHECK_INFO = 'bound-up-vault-check-v1';
export const VAULT_INDEX_INFO = 'bound-up-index-v1';

/**
 * A vault's public fingerprint, stored as `vaults.key_check`.
 *
 * 32 bytes of HKDF output as unpadded base64url — 43 characters, the same
 * shape as the auth secret. One-way, so publishing it reveals nothing about
 * the key, and it is what a device checks an opened wrap against, pins, and
 * reads into the safety number.
 */
export const KEY_CHECK_LENGTH = 43;
export const KEY_CHECK_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${KEY_CHECK_LENGTH}}$`);

/** The key check as it is encoded, given the HKDF output. */
export function encodeKeyCheck(bytes: Uint8Array): string {
	if (bytes.length !== 32) {
		throw new Error(`A key check is 32 bytes, got ${bytes.length}`);
	}
	return toBase64Url(bytes);
}

/**
 * What is inside a vault wrap, before it is age-encrypted to a member.
 *
 * The vault id rides along so a wrap cannot be passed off as belonging to a
 * different vault: age has no associated data, so the binding goes in the
 * plaintext and is checked on the way out, alongside the key check.
 */
export type VaultWrapPayload = {
	v: 1;
	vaultId: string;
	/** The 32-byte key, base64url. */
	key: string;
};

/**
 * How long a wrap's ciphertext may be. An age header with one X25519 stanza
 * plus a payload of well under 200 bytes is about 400 bytes of base64; this
 * leaves room without letting the column carry anything else.
 */
export const MAX_VAULT_WRAP_LENGTH = 2048;

/** What a wrap's ciphertext looks like: standard base64, as message bodies are. */
export const VAULT_WRAP_PATTERN = /^[A-Za-z0-9+/=]+$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Whether a client-chosen id is acceptable.
 *
 * Vault and sealed-record ids are chosen in the browser, because they are part
 * of what the ciphertext is bound to and so must exist before it does. The
 * server accepts only a canonical lowercase UUID, which is what
 * `crypto.randomUUID()` produces.
 */
export function isClientId(value: unknown): value is string {
	return typeof value === 'string' && UUID.test(value);
}

/**
 * The pin id under which a partnership vault's key check is remembered on a
 * device, beside the partner's recipient. A different prefix from the vouch
 * pins in `crypto/pins.ts`, and no partnership id can collide with it because
 * every real one is a UUID.
 */
export function vaultPinId(partnershipId: string): string {
	return `vault:${partnershipId}`;
}
