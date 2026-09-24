/**
 * The email to pre-fill when the app sends someone back to sign in.
 *
 * When a device loses its key (see `EncryptionGate.svelte`) the user is signed
 * out and sent to the login page. Pre-filling their email is what lets a
 * password manager or passkey autofill offer the right account straight away,
 * so signing back in is one tap.
 *
 * `sessionStorage` rather than the URL, so the address does not end up in
 * access logs or browser history; one tab, gone when it closes. Every access is
 * wrapped, because storage throws outright in some private modes and with site
 * data blocked — and the fallback, an empty email box, is harmless.
 */

const KEY = 'bound-up:sign-in-again-email';

export function rememberSignInEmail(email: string): void {
	try {
		globalThis.sessionStorage?.setItem(KEY, email);
	} catch {
		// Survivable: the box starts empty.
	}
}

/** Reads and forgets it, so a later visit to the login page starts clean. */
export function takeSignInEmail(): string | null {
	try {
		const email = globalThis.sessionStorage?.getItem(KEY) ?? null;
		globalThis.sessionStorage?.removeItem(KEY);
		return email;
	} catch {
		return null;
	}
}
