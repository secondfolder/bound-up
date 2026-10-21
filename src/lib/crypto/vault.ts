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
	ACCEPT_LEGACY_SELF_WRAPS,
	encodeKeyCheck,
	SELF_WRAP_INFO,
	selfWrapMacInput,
	VAULT_ENCRYPTION_INFO,
	VAULT_INDEX_INFO,
	VAULT_KEY_BYTES,
	VAULT_KEY_CHECK_INFO,
	type VaultKind,
	type VaultWrapPayload
} from '../vault';
import { importIdentityKey, loadAge, webCryptoX25519Available } from './identity';

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

/** Encrypts a wrap's payload to one recipient. */
async function encryptPayload(payload: VaultWrapPayload, recipient: string): Promise<string> {
	const age = await loadAge();
	const encrypter = new age.Encrypter();
	encrypter.addRecipient(recipient);
	return toBase64(await encrypter.encrypt(encoder.encode(JSON.stringify(payload))));
}

/**
 * Encrypts a partnership vault's key to one member's recipient.
 *
 * age, so a member's long-term identity is what opens it — the same identity
 * their password and passkeys already unlock. The vault id goes inside, because
 * age has no associated data to bind it with; `openVaultWrap` checks it.
 *
 * Not for the self vault, whose wrap is `wrapSelfVaultKey`'s: see
 * `VaultWrapPayload` for why the two differ.
 */
export async function wrapVaultKey(input: {
	vaultId: string;
	raw: Uint8Array;
	recipient: string;
}): Promise<string> {
	return await encryptPayload(
		{ v: 1, vaultId: input.vaultId, key: toBase64Url(input.raw) },
		input.recipient
	);
}

/** A wrap's payload, or null when this identity does not open it or it is not one. */
async function decryptPayload(
	ciphertext: string,
	identity: CryptoKey | string
): Promise<VaultWrapPayload | null> {
	const age = await loadAge();
	const decrypter = new age.Decrypter();
	decrypter.addIdentity(identity);
	let payload: unknown;
	try {
		payload = JSON.parse(await decrypter.decrypt(fromBase64(ciphertext), 'text'));
	} catch {
		return null;
	}
	return isWrapPayload(payload) ? payload : null;
}

/** The raw key a payload carries, when it is for this vault and its fingerprint matches. */
async function keyFromPayload(
	payload: VaultWrapPayload,
	vault: { id: string; keyCheck: string }
): Promise<Uint8Array<ArrayBuffer> | null> {
	if (payload.vaultId !== vault.id) {
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
	return keyCheck === vault.keyCheck ? raw : null;
}

/**
 * The raw key inside a partnership vault's wrap, or null when it is not one
 * this identity opens for this vault.
 *
 * Null for every failure — wrong identity, a wrap for a different vault, a key
 * whose fingerprint is not the vault's — because the caller's response is the
 * same for all of them: this device cannot use the vault. Checking the
 * fingerprint is what stops a server pairing a real wrap with the wrong vault
 * row. It does not stop a server pairing a vault row with a key it made up,
 * since it can compute the fingerprint of its own key: for a partnership
 * vault that is what the pinned key check and the safety number catch, and a
 * self vault's wrap carries a MAC instead (`unwrapSelfVaultKey`). A self
 * vault's version 2 wrap is refused here, so it can only be opened there.
 */
export async function unwrapVaultKey(input: {
	ciphertext: string;
	identity: CryptoKey | string;
	vault: { id: string; keyCheck: string };
}): Promise<Uint8Array<ArrayBuffer> | null> {
	const payload = await decryptPayload(input.ciphertext, input.identity);
	if (payload?.v !== 1) {
		return null;
	}
	return await keyFromPayload(payload, input.vault);
}

/** Opens a partnership vault's wrap all the way to a usable vault. See `unwrapVaultKey`. */
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
	const { v, vaultId, key, mac } = value as Record<string, unknown>;
	if (typeof vaultId !== 'string' || typeof key !== 'string') {
		return false;
	}
	return v === 1 || (v === 2 && typeof mac === 'string');
}

// ── the self vault ───────────────────────────────────────────────────────────

/**
 * The key a self vault's wrap is MACed with: HKDF over the X25519 agreement
 * of the identity with its own public recipient.
 *
 * Only the holder of the identity can compute that agreement, so only they
 * can make a wrap that passes — the server knows the recipient and nothing
 * more. It needs no new secret and no new storage: every device signed in to
 * the account already holds the identity, and one recovered through a
 * partner-assisted sign-in derives the key for its new identity the same way.
 * Works on the non-extractable `CryptoKey` the identity is cached as.
 */
async function selfWrapKey(identity: CryptoKey | string, recipient: string): Promise<CryptoKey> {
	const { bech32 } = await import('@scure/base');
	const decoded = bech32.decodeToBytes(recipient);
	if (decoded.prefix !== 'age' || decoded.bytes.length !== 32) {
		throw new Error('Not an age X25519 recipient');
	}
	let shared: Uint8Array<ArrayBuffer>;
	if (typeof identity === 'string' && !(await webCryptoX25519Available())) {
		// The one case the identity is held as a string: a browser with no
		// X25519 in WebCrypto (see `webCryptoX25519Available`). age-encryption
		// falls back to the same library for it.
		const { x25519 } = await import('@noble/curves/ed25519.js');
		shared = new Uint8Array(
			x25519.getSharedSecret(bech32.decodeToBytes(identity).bytes, decoded.bytes)
		);
	} else {
		const privateKey = typeof identity === 'string' ? await importIdentityKey(identity) : identity;
		const publicKey = await crypto.subtle.importKey(
			'raw',
			new Uint8Array(decoded.bytes),
			{ name: 'X25519' },
			false,
			[]
		);
		shared = new Uint8Array(
			await crypto.subtle.deriveBits({ name: 'X25519', public: publicKey }, privateKey, 256)
		);
	}
	const base = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
	shared.fill(0);
	return await crypto.subtle.deriveKey(
		hkdf(SELF_WRAP_INFO),
		base,
		{ name: 'HMAC', hash: 'SHA-256', length: 256 },
		false,
		['sign', 'verify']
	);
}

/**
 * Encrypts a key to its owner alone, with a MAC only they can make: the self
 * vault's key, and an invite's (`crypto/invite.ts`). See `VaultWrapPayload`.
 */
export async function wrapSelfVaultKey(input: {
	vaultId: string;
	raw: Uint8Array<ArrayBuffer>;
	identity: CryptoKey | string;
	recipient: string;
}): Promise<string> {
	const { keyCheck } = await deriveVaultKeys(input.raw);
	const macKey = await selfWrapKey(input.identity, input.recipient);
	const mac = await crypto.subtle.sign(
		'HMAC',
		macKey,
		encoder.encode(selfWrapMacInput(input.vaultId, keyCheck))
	);
	return await encryptPayload(
		{
			v: 2,
			vaultId: input.vaultId,
			key: toBase64Url(input.raw),
			mac: toBase64Url(new Uint8Array(mac))
		},
		input.recipient
	);
}

/**
 * The raw key inside a wrap made by `wrapSelfVaultKey`, or null when this
 * identity does not open it for `vaultId` — including when its MAC is not
 * one the identity made, which is how a key the server made up is refused.
 * For the self vault and for an invite's key, the two keys a user wraps to
 * nobody but themselves.
 *
 * `legacy` is true for a wrap from before the MAC (version 1), which is
 * opened only while `ACCEPT_LEGACY_SELF_WRAPS` says so.
 */
export async function unwrapOwnKey(input: {
	ciphertext: string;
	identity: CryptoKey | string;
	recipient: string;
	vaultId: string;
}): Promise<{ raw: Uint8Array<ArrayBuffer>; legacy: boolean } | null> {
	const payload = await decryptPayload(input.ciphertext, input.identity);
	if (payload?.vaultId !== input.vaultId) {
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
	if (payload.v === 1) {
		return ACCEPT_LEGACY_SELF_WRAPS ? { raw, legacy: true } : null;
	}
	let mac: Uint8Array<ArrayBuffer>;
	try {
		mac = fromBase64Url(payload.mac);
	} catch {
		return null;
	}
	const { keyCheck } = await deriveVaultKeys(raw);
	const macKey = await selfWrapKey(input.identity, input.recipient);
	const genuine = await crypto.subtle.verify(
		'HMAC',
		macKey,
		mac,
		encoder.encode(selfWrapMacInput(input.vaultId, keyCheck))
	);
	return genuine ? { raw, legacy: false } : null;
}

/**
 * The raw key inside the self vault's wrap, or null when it is not one this
 * identity made for this vault (`unwrapOwnKey`) or its fingerprint is not the
 * vault row's. The caller writes a version 2 wrap in place of a `legacy` one
 * straight away.
 */
export async function unwrapSelfVaultKey(input: {
	ciphertext: string;
	identity: CryptoKey | string;
	recipient: string;
	vault: { id: string; keyCheck: string };
}): Promise<{ raw: Uint8Array<ArrayBuffer>; legacy: boolean } | null> {
	const opened = await unwrapOwnKey({ ...input, vaultId: input.vault.id });
	if (!opened) {
		return null;
	}
	const { keyCheck } = await deriveVaultKeys(opened.raw);
	return keyCheck === input.vault.keyCheck ? opened : null;
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
