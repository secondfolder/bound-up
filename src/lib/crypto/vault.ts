/**
 * Vault keys: making one, wrapping it to a member, opening a wrap, and the
 * keys derived from it.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * A vault key is 32 random bytes and is never used as it is. Everything comes
 * out of HKDF over it, each with its own `info` (`../vault.ts`):
 *
 * - the AES-GCM key records are sealed with (`crypto/sealed.ts`);
 * - the key check, a public fingerprint the server stores and devices pin;
 * - one HMAC key per blind index, made on demand.
 *
 * All of them are non-extractable `CryptoKey`s, so script injected into the
 * page can use them while it runs but cannot walk away with them. The raw
 * bytes exist only while a vault is being created or re-wrapped for someone,
 * and are dropped straight after: re-wrapping opens the device's own wrap
 * again rather than keeping the key around.
 *
 * Symmetric rather than a vault *public key*, on purpose. Anyone can encrypt
 * to a public key — the server included — so a public-key vault would let the
 * server write a record that opens and validates like a real one. Only someone
 * holding this key can produce a record that opens. See docs/encryption.md.
 */

import { fromBase64, fromBase64Url, toBase64, toBase64Url } from '../encryption';
import {
	encodeKeyCheck,
	VAULT_ENCRYPTION_INFO,
	VAULT_INDEX_INFO,
	VAULT_KEY_BYTES,
	VAULT_KEY_CHECK_INFO,
	type VaultKind,
	type VaultWrapPayload
} from '../vault';
import { loadAge } from './identity';

/** An opened vault, as the rest of the app holds it. */
export type OpenVault = {
	id: string;
	kind: VaultKind;
	/** Set for a partnership vault, null for a self vault. */
	partnershipId: string | null;
	keyCheck: string;
	/** AES-GCM, non-extractable. What records are sealed with. */
	encryptionKey: CryptoKey;
	/** The HKDF base the index keys are derived from, non-extractable. */
	indexBase: CryptoKey;
};

const encoder = new TextEncoder();

/** Thirty-two fresh random bytes. Called once per vault, ever. */
export function generateVaultKey(): Uint8Array<ArrayBuffer> {
	return crypto.getRandomValues(new Uint8Array(VAULT_KEY_BYTES));
}

function hkdf(info: string) {
	// No salt: the input is already uniformly random, which is the case RFC 5869
	// says a salt adds nothing to, and a fixed `info` per use is what keeps the
	// outputs apart.
	return { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: encoder.encode(info) };
}

/** Everything derived from a vault key, plus the vault's public fingerprint. */
export async function deriveVaultKeys(raw: Uint8Array<ArrayBuffer>): Promise<{
	encryptionKey: CryptoKey;
	indexBase: CryptoKey;
	keyCheck: string;
}> {
	if (raw.length !== VAULT_KEY_BYTES) {
		throw new Error(`A vault key is ${VAULT_KEY_BYTES} bytes, got ${raw.length}`);
	}
	const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, [
		'deriveKey',
		'deriveBits'
	]);
	const encryptionKey = await crypto.subtle.deriveKey(
		hkdf(VAULT_ENCRYPTION_INFO),
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
	const check = await crypto.subtle.deriveBits(hkdf(VAULT_KEY_CHECK_INFO), base, 256);
	return { encryptionKey, indexBase: base, keyCheck: encodeKeyCheck(new Uint8Array(check)) };
}

/** Opens a vault from its raw key and its row. */
export async function vaultFromKey(
	raw: Uint8Array<ArrayBuffer>,
	row: { id: string; kind: VaultKind; partnershipId: string | null }
): Promise<OpenVault> {
	const derived = await deriveVaultKeys(raw);
	return { ...row, ...derived };
}

/**
 * Encrypts a vault key to one member's recipient.
 *
 * age, so a member's long-term identity is what opens it — the same identity
 * their password and passkeys already unlock. The vault id goes inside, because
 * age has no associated data to bind it with; `openVaultWrap` checks it.
 */
export async function wrapVaultKey(input: {
	vaultId: string;
	raw: Uint8Array;
	recipient: string;
}): Promise<string> {
	const age = await loadAge();
	const encrypter = new age.Encrypter();
	encrypter.addRecipient(input.recipient);
	const payload: VaultWrapPayload = { v: 1, vaultId: input.vaultId, key: toBase64Url(input.raw) };
	return toBase64(await encrypter.encrypt(encoder.encode(JSON.stringify(payload))));
}

/**
 * The raw key inside a wrap, or null when it is not one this identity opens
 * for this vault.
 *
 * Null for every failure — wrong identity, a wrap for a different vault, a key
 * whose fingerprint is not the vault's — because the caller's response is the
 * same for all of them: this device cannot use the vault. Checking the
 * fingerprint is what stops a server pairing a real wrap with the wrong vault
 * row, or a vault row with a key it made up.
 */
export async function unwrapVaultKey(input: {
	ciphertext: string;
	identity: CryptoKey | string;
	vault: { id: string; keyCheck: string };
}): Promise<Uint8Array<ArrayBuffer> | null> {
	const age = await loadAge();
	const decrypter = new age.Decrypter();
	decrypter.addIdentity(input.identity);

	let payload: unknown;
	try {
		payload = JSON.parse(await decrypter.decrypt(fromBase64(input.ciphertext), 'text'));
	} catch {
		return null;
	}
	if (!isWrapPayload(payload) || payload.vaultId !== input.vault.id) {
		return null;
	}

	let raw: Uint8Array<ArrayBuffer>;
	try {
		raw = fromBase64Url(payload.key);
	} catch {
		return null;
	}
	if (raw.length !== VAULT_KEY_BYTES) {
		return null;
	}
	const { keyCheck } = await deriveVaultKeys(raw);
	return keyCheck === input.vault.keyCheck ? raw : null;
}

/** Opens a wrap all the way to a usable vault. See `unwrapVaultKey`. */
export async function openVaultWrap(input: {
	ciphertext: string;
	identity: CryptoKey | string;
	vault: { id: string; kind: VaultKind; partnershipId: string | null; keyCheck: string };
}): Promise<OpenVault | null> {
	const raw = await unwrapVaultKey(input);
	if (!raw) {
		return null;
	}
	const opened = await vaultFromKey(raw, input.vault);
	raw.fill(0);
	return opened;
}

function isWrapPayload(value: unknown): value is VaultWrapPayload {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const { v, vaultId, key } = value as Record<string, unknown>;
	return v === 1 && typeof vaultId === 'string' && typeof key === 'string';
}

// ── blind indexes ────────────────────────────────────────────────────────────

const indexKeys = new WeakMap<CryptoKey, Map<string, Promise<CryptoKey>>>();

function indexKeyFor(vault: OpenVault, purpose: string): Promise<CryptoKey> {
	let byPurpose = indexKeys.get(vault.indexBase);
	if (!byPurpose) {
		byPurpose = new Map();
		indexKeys.set(vault.indexBase, byPurpose);
	}
	let key = byPurpose.get(purpose);
	if (!key) {
		key = crypto.subtle.deriveKey(
			hkdf(`${VAULT_INDEX_INFO}|${purpose}`),
			vault.indexBase,
			{ name: 'HMAC', hash: 'SHA-256', length: 256 },
			false,
			['sign']
		);
		byPurpose.set(purpose, key);
	}
	return key;
}

/**
 * A blind index: a keyed hash of a value, stored in the clear so the database
 * can enforce uniqueness on something it cannot read.
 *
 * Keyed per vault and per purpose (`<kind>|<field>`), so equal values in two
 * partnerships, or in two fields, never share an index. What it reveals is
 * exactly what a unique constraint needs: that two values in one scope are
 * equal. Full-length HMAC-SHA256 — a truncated one could collide and make the
 * constraint refuse two different values.
 *
 * The caller normalises first; whatever counts as "the same" (case, spacing)
 * has to be decided before hashing, because afterwards nothing can.
 */
export async function blindIndex(
	vault: OpenVault,
	purpose: string,
	value: string
): Promise<string> {
	const key = await indexKeyFor(vault, purpose);
	const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
	return toBase64Url(new Uint8Array(mac));
}
