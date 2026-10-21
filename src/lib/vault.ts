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
 *
 * Version 2 is a self vault's wrap, and adds a MAC only the account holder
 * can make. Without it a wrap proves nothing about who made it — age lets
 * anyone encrypt to a public recipient, the server included — so a server
 * could make a self vault of its own, wrap it to the user, and read
 * everything the user then sealed in it. A partnership vault is defended
 * against that by its pinned key check and the safety number instead, and
 * keeps version 1. See docs/encryption.md, "The self vault's wrap".
 */
export type VaultWrapPayload =
	| {
			v: 1;
			vaultId: string;
			/** The 32-byte key, base64url. */
			key: string;
	  }
	| {
			v: 2;
			vaultId: string;
			key: string;
			/** HMAC-SHA256 of `selfWrapMacInput`, base64url, under the identity's self key. */
			mac: string;
	  };

/**
 * The HKDF `info` the self-wrap MAC key is derived under, from the X25519
 * agreement of the user's identity with its own recipient: a secret only the
 * holder of the identity can compute.
 */
export const SELF_WRAP_INFO = 'bound-up-self-vault-v1';

/** What a self vault's MAC covers: the vault and its fingerprint, and so its key. */
export function selfWrapMacInput(vaultId: string, keyCheck: string): string {
	return `${SELF_WRAP_INFO}|${vaultId}|${keyCheck}`;
}

/**
 * Whether a self vault's wrap from before version 2 is still opened.
 *
 * True for now, so every account's own vault upgrades in place the next time
 * one of its devices opens it (`ensure-vaults.ts`), rather than its records
 * being lost. While it is true a server can still plant a version 1 self
 * vault, so the protection is complete only once this is false — which loses
 * the own records of any account that has not opened the app since. TODO:
 * set it to false once accounts have had time to upgrade.
 */
// Typed wide on purpose, so the checks on it read as checks rather than as
// always-true to the type checker and the linter.
export const ACCEPT_LEGACY_SELF_WRAPS: boolean = true;

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

// ── escrow ───────────────────────────────────────────────────────────────────

/** The `purpose` the server's share is derived under: `keyedHash(secret, purpose, escrowId)`. */
export const ESCROW_SHARE_PURPOSE = 'vault-escrow';

/** Domain separation for the inner layer, which is sealed under the share. */
export const ESCROW_AAD_INFO = 'bound-up-escrow-v1';

/**
 * The associated data the vault key is sealed to inside an escrow: the vault
 * it belongs to and that vault's fingerprint, so an escrow cannot be passed
 * off as some other vault's.
 */
export function escrowAad(vaultId: string, keyCheck: string): string {
	return `${ESCROW_AAD_INFO}|${vaultId}|${keyCheck}`;
}

/** What the server's share looks like on the wire: 32 bytes of HMAC, as hex. */
export const ESCROW_SHARE_PATTERN = /^[0-9a-f]{64}$/;

/**
 * How long after a partner-assisted sign-in completes the server will still
 * release its share of the account's escrows. Long enough to sign in on a
 * second device, or come back the next day; short enough that a session
 * stolen weeks later finds nothing to release.
 */
export const ESCROW_RELEASE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
