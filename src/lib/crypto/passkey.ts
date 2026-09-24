/**
 * Small passkey helpers shared by the ceremonies and the screens.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * The ceremonies themselves are in `passkey-ceremony.ts`, and turning what they
 * return into a wrap key is `passkey-wraps.ts`. This used to wrap
 * `age-encryption`'s experimental `age.webauthn` support instead; that ran its
 * own ceremony with a salt per file, so it could never share the sign-in
 * assertion and every passkey sign-in needed a second touch to unlock. It was
 * removed rather than kept alongside, because there were no users whose wraps
 * depended on it.
 */

/**
 * The relying party id for this page.
 *
 * The hostname and never the port, matching what `hooks.server.ts` passes Better
 * Auth as `rpID` — a credential registered under one is invisible to the other.
 */
export function currentRpId(): string {
	return location.hostname;
}

/** Whether this browser could be asked at all. */
export function passkeysAvailable(): boolean {
	return (
		// `PublicKeyCredential` existing is itself the browser check: nothing
		// else defines it.
		typeof PublicKeyCredential !== 'undefined' &&
		typeof navigator !== 'undefined' &&
		navigator.credentials !== undefined &&
		navigator.credentials !== null
	);
}

/**
 * Why a ceremony produced nothing, and what to say about it.
 *
 * Always a message, never silence. WebAuthn reports "you cancelled", "no
 * credential matched" and "the provider gave up" as the *same* error,
 * deliberately, so that a page cannot use the failure to learn which passkeys
 * exist. A device with no passkey therefore looks exactly like a deliberate
 * dismissal, and a button that did nothing visibly would read as broken.
 *
 * - `no-assertion` — nothing came back. Quiet: it is usually a dismissal.
 * - `unknown` — kept verbatim, because a message nobody predicted is more use
 *   to whoever reads the bug report than one this file invented.
 */
export type PasskeyFailure = {
	kind: 'no-assertion' | 'unknown';
	message: string;
};

export function describePasskeyFailure(error: unknown): PasskeyFailure {
	// `@simplewebauthn/browser` rethrows the browser's `NotAllowedError` as its
	// own `WebAuthnError`, keeping the name, so match on the name alone.
	if (error instanceof Error && error.name === 'NotAllowedError') {
		return {
			kind: 'no-assertion',
			message:
				'No passkey answered. Dismissing the prompt does that — so does having no passkey saved for this site yet.'
		};
	}

	const message = error instanceof Error ? error.message : String(error);
	return { kind: 'unknown', message };
}
