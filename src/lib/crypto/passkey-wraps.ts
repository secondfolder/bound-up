/**
 * Turning what a passkey hands back into a wrap key.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * A passkey can give the page one of two secrets, and each opens its own kind
 * of wrap (see `KeyWrapType` in `encryption.ts`):
 *
 * - **PRF output** — 32 bytes the authenticator computes from the fixed salt
 *   and a key it never releases. The strong one.
 * - **The user handle** — `0x01 ‖ 32 random bytes`, set by this browser as the
 *   passkey's `user.id` when it was created and returned by every assertion.
 *   Works with every provider, because every discoverable passkey stores its
 *   user handle. The weaker one: the bytes sit in the passkey provider's vault.
 *   Never known to this server, because the ceremonies in `passkey-ceremony.ts`
 *   strip the handle before posting.
 *
 * Both go through HKDF with their own `info` into a non-extractable AES-GCM
 * key, and from there the envelope is exactly the password wrap's
 * (`wrap.ts`), AAD and all.
 */

import {
	fromBase64Url,
	type KeyWrapParams,
	PASSKEY_HANDLE_WRAP_INFO,
	PASSKEY_PRF_SALT_SOURCE,
	PASSKEY_PRF_WRAP_INFO,
	type PasskeyWrapType,
	USER_HANDLE_SECRET_BYTES,
	USER_HANDLE_SECRET_PREFIX
} from '../encryption';
import { unwrapIdentity, wrapIdentity } from './wrap';

const encoder = new TextEncoder();

/** The PRF input for every evaluation: SHA-256 of a fixed, versioned string. */
export async function passkeyPrfSalt(): Promise<Uint8Array<ArrayBuffer>> {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(PASSKEY_PRF_SALT_SOURCE));
	return new Uint8Array(digest);
}

/**
 * A fresh user handle carrying a secret: `0x01 ‖ 32 random bytes`.
 *
 * Generated in the browser for every registration and written over whatever
 * `user.id` the server proposed. Better Auth generates its own, but never
 * stores it or checks it, so replacing it costs nothing — and a handle the
 * server generated has passed through the server, which is exactly what this
 * secret must never have done.
 */
export function newUserHandle(): Uint8Array<ArrayBuffer> {
	const handle = new Uint8Array(1 + USER_HANDLE_SECRET_BYTES);
	handle[0] = USER_HANDLE_SECRET_PREFIX;
	handle.set(crypto.getRandomValues(new Uint8Array(USER_HANDLE_SECRET_BYTES)), 1);
	return handle;
}

/**
 * The secret inside a user handle, or null when the handle carries none.
 *
 * Takes the base64url string an assertion reports. Anything without the prefix
 * byte or of the wrong length is not ours — most likely a handle Better Auth
 * generated, which is not a secret at all — and must never be used as one.
 */
export function parseHandleSecret(
	userHandle: string | null | undefined
): Uint8Array<ArrayBuffer> | null {
	if (!userHandle) {
		return null;
	}
	let bytes: Uint8Array<ArrayBuffer>;
	try {
		bytes = fromBase64Url(userHandle);
	} catch {
		return null;
	}
	if (bytes.length !== 1 + USER_HANDLE_SECRET_BYTES || bytes[0] !== USER_HANDLE_SECRET_PREFIX) {
		return null;
	}
	return bytes.slice(1);
}

/**
 * The PRF `first` output in whatever shape the browser returned it.
 *
 * The spec says `ArrayBuffer`. Some password-manager extensions that wrap
 * WebAuthn return a typed array instead, and a JSON round trip (as
 * `toJSON()` does) turns it into base64url — so all three are accepted rather
 * than letting one provider's shape silently cost the user their unlock.
 */
export function prfOutputBytes(value: unknown): Uint8Array<ArrayBuffer> | null {
	if (value instanceof ArrayBuffer) {
		return new Uint8Array(value.slice(0));
	}
	if (ArrayBuffer.isView(value)) {
		// Copied into a fresh buffer, which also narrows a possibly shared one to
		// the plain `ArrayBuffer` that `crypto.subtle` takes.
		const copy = new Uint8Array(value.byteLength);
		copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
		return copy;
	}
	if (typeof value === 'string') {
		try {
			return fromBase64Url(value);
		} catch {
			return null;
		}
	}
	return null;
}

/** The AES-GCM key a passkey secret opens its wrap with. Never extractable. */
export async function passkeyWrapKey(
	type: PasskeyWrapType,
	secret: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
	const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
	return await crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: new Uint8Array(0),
			info: encoder.encode(
				type === 'passkey-prf' ? PASSKEY_PRF_WRAP_INFO : PASSKEY_HANDLE_WRAP_INFO
			)
		},
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

/** Seals the identity to one passkey's secret. Returns what the server stores. */
export async function wrapIdentityToPasskey(input: {
	type: PasskeyWrapType;
	secret: Uint8Array<ArrayBuffer>;
	identity: string;
	recipient: string;
	credentialId: string;
	rpId: string;
}): Promise<{ params: KeyWrapParams; blob: string }> {
	return {
		params: { type: input.type, version: 1, credentialId: input.credentialId, rpId: input.rpId },
		blob: await wrapIdentity({
			wrapKey: await passkeyWrapKey(input.type, input.secret),
			identity: input.identity,
			recipient: input.recipient
		})
	};
}

/** What a passkey sign-in produced that might open a wrap. */
export type PasskeySecrets = {
	credentialId: string;
	prf: Uint8Array<ArrayBuffer> | null;
	handle: Uint8Array<ArrayBuffer> | null;
};

/**
 * Opens the wrap belonging to the credential that just signed in.
 *
 * Matches on `credentialId` rather than trying every wrap: the assertion names
 * its credential, and every passkey has exactly one wrap. Returns null when
 * there is no such wrap, or when the secret it needs did not come back —
 * which `session.svelte.ts` treats as a bug to report, not a state to render.
 */
export async function openPasskeyWrap(input: {
	secrets: PasskeySecrets;
	recipient: string;
	wraps: readonly { id: string; params: KeyWrapParams; blob: string }[];
}): Promise<{ identity: string; wrapId: string } | null> {
	for (const wrap of input.wraps) {
		const { params } = wrap;
		if (params.type === 'password' || params.credentialId !== input.secrets.credentialId) {
			continue;
		}
		const secret = params.type === 'passkey-prf' ? input.secrets.prf : input.secrets.handle;
		if (!secret) {
			continue;
		}
		const identity = await unwrapIdentity({
			wrapKey: await passkeyWrapKey(params.type, secret),
			blob: wrap.blob,
			recipient: input.recipient
		});
		if (identity) {
			return { identity, wrapId: wrap.id };
		}
	}
	return null;
}
