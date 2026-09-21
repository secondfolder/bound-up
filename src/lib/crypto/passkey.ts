/**
 * Unlocking the message identity with a passkey.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * A thin layer over `age-encryption`'s own WebAuthn support, which is doing all
 * of the interesting work: it runs the `navigator.credentials.get()` ceremony
 * with `userVerification: 'required'`, carries a fresh 16-byte nonce in the age
 * stanza, and derives the file key from **both** PRF outputs — `first` and
 * `second` — so that one user-presence check cannot be made to yield two
 * decryptions. It also absorbs the 1Password extension's non-standard PRF
 * result shape. None of that is worth reimplementing here.
 *
 * So a passkey wrap is an age file rather than the AES-GCM envelope in
 * `wrap.ts`, and `KeyWrapParams` says as much. The server is unaffected: it has
 * only ever stored a type, an opaque params blob and a ciphertext.
 *
 * What this costs, and it is written down in docs/encryption.md: the passkey
 * has to have been registered with the PRF extension. `PRF_REGISTRATION_EXTENSIONS`
 * in `server/auth.ts` asks for it on every passkey this app creates, and a
 * credential that cannot do PRF fails loudly at enrolment — which is the right
 * moment, rather than on a new device with no password to hand.
 *
 * `age.webauthn` is marked experimental upstream, which is why `age-encryption`
 * is pinned rather than carets in package.json.
 */

import { bech32 } from '@scure/base';
import { fromBase64Url, toBase64Url } from '../encryption';
import { loadAge } from './identity';

/**
 * The relying party id for this page.
 *
 * The hostname and never the port, matching what `hooks.server.ts` passes Better
 * Auth as `rpID` — a credential registered under one is invisible to the other.
 */
export function currentRpId(): string {
	return window.location.hostname;
}

/** Whether this browser could be asked at all. Says nothing about PRF. */
export function passkeysAvailable(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof PublicKeyCredential !== 'undefined' &&
		navigator.credentials != null
	);
}

/**
 * age's handle for one specific credential: `AGE-PLUGIN-FIDO2PRF-1…`.
 *
 * Handed to `WebAuthnRecipient`/`WebAuthnIdentity` as `identity`, where it
 * pins `allowCredentials` to exactly this passkey. Without it both ceremonies
 * pass an empty `allowCredentials` and the platform opens a chooser — which
 * right after registering a passkey is a confusing second prompt, and which
 * makes "which passkey does this wrap belong to" unanswerable, because the user
 * may well pick a different one.
 *
 * ## Why this is hand-rolled
 *
 * `age-encryption` builds this string in `createCredential()` and exports
 * neither that encoder nor `createCredential`'s usefulness here —
 * `createCredential` registers a credential Better Auth knows nothing about,
 * which would never appear in the Security page's list. So the encoding is
 * reproduced: bech32 (no length limit, as upstream) over CTAP2-flavoured CBOR
 * of version, credential id, rp id and transports, upper-cased.
 *
 * That is a private format, which is normally a bad thing to depend on. Two
 * things make it acceptable: `age-encryption` is pinned to an exact version in
 * package.json precisely because `age.webauthn` is experimental, so the format
 * cannot move underneath us without a deliberate bump; and
 * `passkey.test.ts` holds a frozen vector and round-trips the result through
 * `WebAuthnIdentity`, so a bump that did change it fails in CI rather than on
 * someone's phone.
 *
 * Everything in here is public: a credential id, a hostname and transport
 * hints. It is stored in the wrap's `params`, beside a ciphertext the server
 * cannot read either way.
 */
export function encodeAgeCredentialIdentity(input: {
	credentialId: Uint8Array;
	rpId: string;
	transports: readonly string[];
}): string {
	const data = new Uint8Array([
		...cborUint(1),
		...cborByteString(input.credentialId),
		...cborTextString(input.rpId),
		...cborArray(input.transports)
	]);
	return bech32.encode('AGE-PLUGIN-FIDO2PRF-', bech32.toWords(data), false).toUpperCase();
}

// A tiny subset of CTAP2's subset of CBOR: unsigned integers, byte strings,
// text strings and arrays of text strings, with 16-bit arguments. Mirrors
// `cbor.ts` in age-encryption, which is not exported from the package.
function cborHead(major: number, length: number): number[] {
	if (length <= 23) return [(major << 5) | length];
	if (length <= 0xff) return [(major << 5) | 24, length];
	if (length <= 0xffff) return [(major << 5) | 25, length >> 8, length & 0xff];
	throw new Error('cbor: argument too large');
}

function cborUint(n: number): number[] {
	return cborHead(0, n);
}

function cborByteString(bytes: Uint8Array): number[] {
	return [...cborHead(2, bytes.length), ...bytes];
}

function cborTextString(text: string): number[] {
	const bytes = new TextEncoder().encode(text);
	return [...cborHead(3, bytes.length), ...bytes];
}

function cborArray(items: readonly string[]): number[] {
	return [...cborHead(4, items.length), ...items.flatMap(cborTextString)];
}

/**
 * Seals the identity to a passkey.
 *
 * With `ageIdentity`, the ceremony goes straight to that credential. Without
 * it, `WebAuthnRecipient` gets only the RP id and the platform offers the user
 * whichever of their passkeys they like — which is what `PasskeyOffer` does,
 * because it is sealing to a passkey the user has already chosen to have and
 * has no particular one in mind.
 */
export async function wrapIdentityToPasskey(input: {
	identity: string;
	rpId: string;
	ageIdentity?: string;
}): Promise<string> {
	const age = await loadAge();
	const encrypter = new age.Encrypter();
	encrypter.addRecipient(
		new age.webauthn.WebAuthnRecipient(
			input.ageIdentity ? { identity: input.ageIdentity } : { rpId: input.rpId }
		)
	);
	return toBase64Url(await encrypter.encrypt(input.identity));
}

/**
 * Opens a passkey wrap, prompting for the passkey.
 *
 * Throws rather than returning null, unlike `unwrapIdentity`: every way this
 * fails is worth distinguishing for the user — a dismissed sheet, a passkey
 * without PRF, the wrong passkey — and `describePasskeyFailure` is what turns
 * the result into something to show.
 *
 * `ageIdentity` is absent on wraps written before the credential binding
 * existed, and those still open through the chooser exactly as they used to.
 */
export async function unwrapIdentityWithPasskey(input: {
	blob: string;
	rpId: string;
	ageIdentity?: string;
}): Promise<string> {
	const age = await loadAge();
	const decrypter = new age.Decrypter();
	decrypter.addIdentity(
		new age.webauthn.WebAuthnIdentity(
			input.ageIdentity ? { identity: input.ageIdentity } : { rpId: input.rpId }
		)
	);
	return decrypter.decrypt(fromBase64Url(input.blob), 'text');
}

/**
 * Why a ceremony produced nothing, and what to say about it.
 *
 * Always a message, never silence. The first version of this returned nothing
 * for `NotAllowedError` on the grounds that a user who dismisses a sheet does
 * not need to be told they dismissed it — which was wrong, because WebAuthn
 * reports "you cancelled", "no credential matched" and "the provider gave up"
 * as the *same* error, deliberately, so that a page cannot use the failure to
 * learn which passkeys exist. A device with no usable passkey therefore looked
 * exactly like a deliberate dismissal: the button did nothing, visibly.
 *
 * - `no-assertion` — nothing came back. Quiet: it is usually a dismissal.
 * - `no-prf` — a passkey answered but its provider returned no PRF output, so
 *   it cannot be used for this. age's own message blames the OS version, which
 *   is misleading when the authenticator is a password manager on an
 *   up-to-date machine, so it is replaced here.
 * - `unknown` — kept verbatim, because a message nobody predicted is more use
 *   to whoever reads the bug report than one this file invented.
 */
export type PasskeyFailure = {
	kind: 'no-assertion' | 'no-prf' | 'unknown';
	message: string;
};

/** Matches what `age.webauthn` throws when the PRF results are missing. */
const NO_PRF = /PRF extension not available|Missing second PRF result/i;

export function describePasskeyFailure(error: unknown): PasskeyFailure {
	if (error instanceof DOMException && error.name === 'NotAllowedError') {
		return {
			kind: 'no-assertion',
			message:
				'No passkey answered. Dismissing the prompt does that — so does having no passkey saved for this site yet.'
		};
	}

	const message = error instanceof Error ? error.message : String(error);
	if (NO_PRF.test(message)) {
		return {
			kind: 'no-prf',
			message:
				'That passkey cannot unlock your messages: its provider did not return the extra key material this needs. Passkeys saved in iCloud Keychain, Google Password Manager or Windows Hello support it; some password managers do not yet.'
		};
	}

	return { kind: 'unknown', message };
}
