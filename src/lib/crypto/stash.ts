/**
 * A hand-off between the sign-in form and the encryption gate.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * Signing in is what unlocks. The form already holds what opens the identity —
 * a wrap key derived from the password, or the secrets a passkey assertion
 * returned — and a moment later the app shell mounts and needs it. This is
 * where it waits in between.
 *
 * A module-level variable and nothing more. It survives the trip because both
 * sign-in paths end in `goto()` — a client-side navigation, so the module is
 * not re-evaluated. It does NOT survive a full page load, which is correct:
 * nothing here is persisted, and a device that has lost its key signs in again.
 *
 * Read once. `takeUnlock` clears as it returns, so a stale key cannot be picked
 * up by a later navigation, and there is no window where two callers disagree
 * about whose credentials these are.
 */

import type { PasskeySecrets } from './passkey-wraps';

/**
 * Why the sign-in happened, when it was not the user's own idea.
 *
 * `device` means the app sent them back to sign in because this browser had
 * lost its key — usually cleared storage. That is the moment to explain
 * persistent storage, and nothing else changes because of it.
 */
export type SignInReason = 'device';

type Stashed = { reason?: SignInReason } & (
	| {
			kind: 'password';
			/** The email the key was derived from, so a mismatch can be detected. */
			email: string;
			wrapKey: CryptoKey;
			/** Set by signup and recovery, which generate the identity in the same submit. */
			identity?: string;
			recipient?: string;
	  }
	| ({ kind: 'passkey' } & PasskeySecrets)
);

let stashed: Stashed | undefined;

export function stashUnlock(value: Stashed): void {
	stashed = value;
}

/**
 * Takes what was stashed, if it belongs to this user.
 *
 * A password stash names its email, which is checked rather than trusted:
 * signing in as one account, then as another without a full reload, would
 * otherwise hand the second session the first one's wrap key — which would
 * fail to unwrap, but would fail confusingly. A passkey stash needs no such
 * check, because it is matched to a wrap by credential id and a credential
 * belongs to exactly one account.
 */
export function takeUnlock(email: string): Stashed | undefined {
	const value = stashed;
	stashed = undefined;
	if (!value) {
		return undefined;
	}
	if (value.kind === 'password' && value.email !== email) {
		return undefined;
	}
	return value;
}

/** Drops anything held, on sign-out. */
export function clearStash(): void {
	stashed = undefined;
}
