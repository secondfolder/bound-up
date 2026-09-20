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
 * Seals the identity to a passkey, prompting for one.
 *
 * `allowCredentials` is left empty — `WebAuthnRecipient` is given only the RP
 * id — so the platform offers the user whichever of their passkeys they like.
 * The alternative, `age.webauthn.createCredential()`, would register a second
 * passkey that Better Auth knows nothing about and that never appears in the
 * Security page's list, which is harder to explain than a picker.
 */
export async function wrapIdentityToPasskey(input: {
	identity: string;
	rpId: string;
}): Promise<string> {
	const age = await loadAge();
	const encrypter = new age.Encrypter();
	encrypter.addRecipient(new age.webauthn.WebAuthnRecipient({ rpId: input.rpId }));
	return toBase64Url(await encrypter.encrypt(input.identity));
}

/**
 * Opens a passkey wrap, prompting for the passkey.
 *
 * Throws rather than returning null, unlike `unwrapIdentity`: every way this
 * fails is worth distinguishing for the user — a dismissed sheet, a passkey
 * without PRF, the wrong passkey — and `describePasskeyFailure` is what turns
 * the result into something to show.
 */
export async function unwrapIdentityWithPasskey(input: {
	blob: string;
	rpId: string;
}): Promise<string> {
	const age = await loadAge();
	const decrypter = new age.Decrypter();
	decrypter.addIdentity(new age.webauthn.WebAuthnIdentity({ rpId: input.rpId }));
	return decrypter.decrypt(fromBase64Url(input.blob), 'text');
}

/**
 * What to say about a ceremony that did not finish.
 *
 * `cancelled` covers a dismissed sheet, a timeout and a passkey the user does
 * not have: WebAuthn reports all of them as `NotAllowedError` deliberately, so
 * that a page cannot use the error to learn which credentials exist. There is
 * nothing to tell the user about it — they were there.
 *
 * Everything else keeps age's own message, which is unusually good at this:
 * "PRF extension not available (need macOS 15+, Chrome 132+)" is more useful
 * than anything this file could say instead.
 */
export function describePasskeyFailure(error: unknown): { cancelled: boolean; message: string } {
	if (error instanceof DOMException && error.name === 'NotAllowedError') {
		return { cancelled: true, message: '' };
	}
	return {
		cancelled: false,
		message: error instanceof Error ? error.message : String(error)
	};
}
