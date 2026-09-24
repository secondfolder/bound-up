/**
 * The unlocked identity for this browser session.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * One module-level piece of state, because there is one identity per signed-in
 * user and every screen that touches a message needs the same one. Components
 * read it through `currentKeyring()`; nothing else may reassign it.
 *
 * There is no unlock step. **Signing in is what unlocks**: the password form
 * and the passkey ceremony both leave what opens the identity in the stash, and
 * `initialiseKeyring` picks it up and caches the identity on this device. A
 * device that ends up without it — cleared storage, most often — is sent back
 * to sign in by `EncryptionGate`, which is the same thing again.
 */

import { normaliseEmail } from '../encryption';
import type { KeyWrapView, UnlockBundleView } from '../types';
import { type KeyTier, keyStore } from './keystore';
import { openPasskeyWrap } from './passkey-wraps';
import { clearStash, takeUnlock } from './stash';
import { dismissStorageExplanation, offerStorageExplanation } from './storage-persistence.svelte';
import { resetTrust } from './trust.svelte';
import { unwrapIdentity } from './wrap';

export type Keyring =
	/** Not looked at yet. Screens render a placeholder, never content. */
	| { status: 'unknown' }
	/**
	 * This device does not hold the identity, and nothing handed over one.
	 *
	 * Not a screen: `EncryptionGate` sends the user back to sign in, and
	 * everything renders the `unknown` placeholder in the meantime.
	 *
	 * `signInFailed` is the case that must not redirect: a sign-in just handed
	 * over its secret and it did not open anything. That should be impossible —
	 * every passkey is created with a wrap — so it is a bug, and redirecting
	 * would send the user round in a circle rather than surface it.
	 */
	| { status: 'locked'; signInFailed: boolean }
	/**
	 * Signing out: the key has just been forgotten on purpose.
	 *
	 * Distinct from `unknown` because the gate reacts to `unknown` by working
	 * the state out again — and doing that while a sign-out is in flight found
	 * no key, decided the device needed to sign in again, and raced the
	 * sign-out's own redirect with one of its own. Nothing reacts to this; the
	 * next time the app shell mounts, `initialiseKeyring` starts afresh.
	 */
	| { status: 'signed-out' }
	/**
	 * Open. `identity` is a non-extractable `CryptoKey` wherever the browser can
	 * do X25519, and the raw string otherwise — see `webCryptoX25519Available`.
	 */
	| {
			status: 'unlocked';
			recipient: string;
			identity: CryptoKey | string;
			/** False when the identity is held in memory only, so it is lost on reload. */
			durable: boolean;
			/** Which form this device could store. See `keystore.ts`. */
			tier: KeyTier;
			/** Why this device is not on the best tier, for the Security page. */
			fallbackReason: string | null;
	  };

let keyring = $state<Keyring>({ status: 'unknown' });

let initialisingForUserId: string | null = null;
let initialisingPromise: Promise<Keyring> | null = null;

/** The current keyring. Reactive: reading this in a template tracks it. */
export function currentKeyring(): Keyring {
	return keyring;
}

/** The identity, or null when there is none. For the encrypt/decrypt helpers. */
export function unlockedIdentity(): { recipient: string; identity: CryptoKey | string } | null {
	return keyring.status === 'unlocked'
		? { recipient: keyring.recipient, identity: keyring.identity }
		: null;
}

async function cache(userId: string, recipient: string, identity: string): Promise<Keyring> {
	const store = await keyStore();
	// The store decides what form to write and hands back the form to hold in
	// memory — a non-extractable CryptoKey wherever the browser can do X25519,
	// the string otherwise. See the tier ladder in `keystore.ts`.
	const cached = await store.putIdentity({ userId, recipient, identity });
	return {
		status: 'unlocked',
		recipient,
		identity: cached.key,
		durable: store.durable,
		tier: store.tier,
		fallbackReason: store.fallbackReason
	};
}

/**
 * Tries every password wrap against a wrap key.
 *
 * More than one password wrap can legitimately exist — a password change
 * inserts the new one before changing the credential — so this is a loop
 * rather than a lookup.
 */
async function tryPasswordWraps(
	wraps: KeyWrapView[],
	recipient: string,
	wrapKey: CryptoKey
): Promise<string | null> {
	for (const wrap of wraps) {
		if (wrap.type !== 'password') {
			continue;
		}
		const identity = await unwrapIdentity({ wrapKey, blob: wrap.blob, recipient });
		if (identity) {
			return identity;
		}
	}
	return null;
}

/**
 * Works out where this device stands, without asking for anything.
 *
 * Called by `EncryptionGate` when the app shell mounts, and again whenever the
 * keyring goes back to `unknown`. Two ways it ends up unlocked: the identity is
 * already cached here, or the user signed in moments ago and the stash holds
 * what opens it. Otherwise it is `locked`, and the gate sends them to sign in.
 *
 * Throws when the bundle cannot be fetched, or when the account has no keys —
 * which cannot happen for an account created by this app, so it is reported
 * rather than rendered.
 */
export async function initialiseKeyring(user: { id: string; email: string }): Promise<Keyring> {
	if (keyring.status === 'signed-out') {
		// Signed out and now back: a fresh start, as if the tab were new — but
		// not `resetKeyring()`, which would also clear the stash, and the stash
		// is exactly what the sign-in that brought us here just left.
		keyring = { status: 'unknown' };
	}
	if (keyring.status !== 'unknown') {
		return keyring;
	}
	if (initialisingForUserId === user.id && initialisingPromise !== null) {
		return await initialisingPromise;
	}

	const run = (async (): Promise<Keyring> => {
		const storePromise = keyStore();
		const bundlePromise = fetchBundle();
		// Marked handled at once: every path below either awaits it or attaches
		// its own handler, but one that throws first (a refused IndexedDB, say)
		// would otherwise leave its rejection unhandled.
		bundlePromise.catch(() => undefined);
		const store = await storePromise;

		const cached = await store.getIdentity(user.id);
		if (cached) {
			// Nothing to hand over when the key is already here, and a stash left
			// lying about could be picked up by a later, unrelated initialise.
			clearStash();
			// Checked after the fact rather than awaited, so a cached device opens
			// without waiting on the network. The mismatch is real but rare: a
			// partner-assisted sign-in on another device replaces the identity, and
			// this one would otherwise keep decrypting with a key nothing is
			// encrypted to any more. Dropping it sends the user to sign in again.
			void bundlePromise
				.then(async (served) => {
					if (served.recipient !== cached.recipient && keyring.status === 'unlocked') {
						await store.clear(user.id);
						keyring = { status: 'locked', signInFailed: false };
					}
				})
				.catch(() => undefined);
			keyring = {
				status: 'unlocked',
				recipient: cached.recipient,
				identity: cached.key,
				durable: store.durable,
				tier: store.tier,
				fallbackReason: store.fallbackReason
			};
			return keyring;
		}

		const bundle = await bundlePromise;
		const stashed = takeUnlock(normaliseEmail(user.email));
		if (!stashed) {
			keyring = { status: 'locked', signInFailed: false };
			return keyring;
		}

		let identity: string | null = null;
		if (stashed.kind === 'password') {
			// Signup and recovery already have the identity in hand; login has to
			// open a wrap.
			identity =
				stashed.identity && stashed.recipient === bundle.recipient
					? stashed.identity
					: await tryPasswordWraps(bundle.wraps, bundle.recipient, stashed.wrapKey);
		} else {
			identity =
				(
					await openPasskeyWrap({
						secrets: stashed,
						recipient: bundle.recipient,
						wraps: bundle.wraps
					})
				)?.identity ?? null;
		}

		if (!identity) {
			console.error(
				`signing in with a ${stashed.kind} did not open this account's key — every way in should have a wrap`
			);
			keyring = { status: 'locked', signInFailed: true };
			return keyring;
		}

		keyring = await cache(user.id, bundle.recipient, identity);
		if (stashed.reason === 'device') {
			// The browser had cleared its storage and that just cost a sign-in,
			// which is the one moment asking to keep it has context. See
			// `storage-persistence.svelte.ts`.
			void offerStorageExplanation(keyring.status === 'unlocked' && keyring.durable);
		}
		return keyring;
	})();

	initialisingForUserId = user.id;
	initialisingPromise = run.finally(() => {
		if (initialisingForUserId === user.id) {
			initialisingForUserId = null;
			initialisingPromise = null;
		}
	});

	return await initialisingPromise;
}

/**
 * Forgets the identity on this device, as part of signing out.
 *
 * Leaves the keyring at `signed-out`, which renders a placeholder everywhere
 * and, unlike `unknown`, sets nothing working the state out again while the
 * sign-out is still in flight. Whatever comes next — a sign-in, or a different
 * account in the same tab — starts afresh.
 *
 * Note what this cannot do: another device that has already unlocked holds the
 * identity and needs neither the password nor this server to keep reading what
 * it has. Signing out revokes a session, not a key. See docs/encryption.md.
 */
export async function lock(userId: string): Promise<void> {
	resetKeyring();
	keyring = { status: 'signed-out' };
	const store = await keyStore();
	await store.clear(userId);
}

/** Drops in-memory state without touching storage, e.g. on a user change. */
export function resetKeyring(): void {
	clearStash();
	dismissStorageExplanation();
	resetTrust();
	keyring = { status: 'unknown' };
	initialisingForUserId = null;
	initialisingPromise = null;
}

// ── server round trips ───────────────────────────────────────────────────────

async function fetchBundle(): Promise<UnlockBundleView> {
	const response = await fetch('/api/keys/unlock-bundle');
	if (!response.ok) {
		throw new Error(`Could not load encryption keys (${response.status})`);
	}
	return response.json();
}
