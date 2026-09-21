/**
 * Which unlock controls a locked device should show.
 *
 * Pure and alias-free so it can be tested without a DOM, WebAuthn or a
 * keyring. `UnlockPanel.svelte` renders the result and decides nothing itself,
 * which is the point: the cases below are easy to get subtly wrong and were
 * previously spread across three call sites that had already drifted apart —
 * the two messaging screens offered no passkey button at all.
 */

export type UnlockMode =
	/** A passkey wrap exists. Offer the passkey first; the password is a step aside. */
	| 'passkey-ready'
	/**
	 * Passkeys are registered, and every one of them has been tried and cannot
	 * do PRF.
	 *
	 * Its own mode rather than falling through to the password, because the
	 * reason has to be said. Someone who set up a passkey and is then asked for
	 * a password with no explanation concludes the app is broken, and the actual
	 * cause — their password manager does not return PRF output — is something
	 * they can only act on if they are told.
	 *
	 * Note the strength of the condition: *every* passkey known to fail. One
	 * unverdicted passkey is enough to fall to `offer-setup` instead, because a
	 * passkey registered before this check existed might well work.
	 */
	| 'passkeys-unusable'
	/**
	 * No wrap yet, and something might still be made to work.
	 *
	 * Either the account has no passkey at all, or it has one this app has never
	 * tried — registered before the PRF check existed, or left unsealed when a
	 * wrap was revoked. Both end in the same offer, because both need the
	 * password first: the device is locked, so there is no identity in hand to
	 * seal to anything.
	 *
	 * Deliberately does NOT offer "unlock with a passkey". With no wrap there is
	 * nothing to open, and with no passkey at all the platform opens a chooser
	 * with nothing in it and reports that as a plain `NotAllowedError` — the
	 * same error a dismissal gives — so the button would appear to do nothing
	 * and could not explain itself.
	 */
	| 'offer-setup'
	/** This browser has no WebAuthn, so there is only the password. */
	| 'password-only';

export type UnlockModeInput = {
	/** A `webauthn-prf` wrap exists, so a passkey can actually open the identity. */
	hasPasskeyWrap: boolean;
	/** How many passkeys the account has registered. Not the same question. */
	passkeyCount: number;
	/** How many of those were tried and could not do PRF. */
	passkeysKnownUnusable: number;
	/** `navigator.credentials` exists here. Says nothing about PRF. */
	passkeysAvailable: boolean;
};

export function unlockMode(input: UnlockModeInput): UnlockMode {
	if (!input.passkeysAvailable) return 'password-only';
	if (input.hasPasskeyWrap) return 'passkey-ready';
	if (input.passkeyCount > 0 && input.passkeysKnownUnusable >= input.passkeyCount) {
		return 'passkeys-unusable';
	}
	return 'offer-setup';
}
