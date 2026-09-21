/**
 * The unlocked identity for this browser session.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * One module-level piece of state, because there is one identity per signed-in
 * user and every screen that touches a message needs the same one. Components
 * read it through `currentKeyring()`; nothing else may reassign it.
 */

import { normaliseEmail, type KeyWrapParams } from '../encryption';
import { deriveMasterKey, deriveWrapKey, type MasterKey } from './kdf';
import { keyStore, type KeyTier } from './keystore';
import { passkeysAvailable, unwrapIdentityWithPasskey } from './passkey';
import { clearStash, takeUnlock } from './stash';
import { unwrapIdentity } from './wrap';
import type { KeyWrapView, UnlockBundleView } from '../types';

export type Keyring =
	/** Not looked at yet. The gate has not run. */
	| { status: 'unknown' }
	/** This account has no message keys — a legacy or passkey-first account. */
	| { status: 'absent' }
	/**
	 * Keys exist but this device cannot open them yet.
	 *
	 * `reason` is what the prompt says: a cold start is ordinary and expected
	 * (storage evicted, new device, passkey sign-in), a failed attempt is not.
	 */
	| {
			status: 'locked';
			recipient: string;
			wraps: KeyWrapView[];
			reason: 'cold' | 'wrong-password' | 'no-usable-wrap';
			/**
			 * Which form this device could store, known before the unlock rather
			 * than after it — so the prompt can say up front that it will be back.
			 */
			tier: KeyTier;
			/** How many passkeys the account has, so one can be offered after. */
			passkeyCount: number;
			/** How many of those were tried against PRF and could not do it. */
			passkeysKnownUnusable: number;
			/** The AAGUID of one that failed, so the prompt can name the provider. */
			unusableProviderAaguid: string | null;
	  }
	/**
	 * Open. `identity` is a non-extractable `CryptoKey` wherever the browser can
	 * do X25519, and the raw string otherwise — see `webCryptoX25519Available`.
	 */
	| {
			status: 'unlocked';
			recipient: string;
			identity: CryptoKey | string;
			/** False when the identity is held in memory only, so unlock repeats. */
			durable: boolean;
			/** Which form this device could store. See `keystore.ts`. */
			tier: KeyTier;
			/** Why this device is not on the best tier, for /settings/encryption. */
			fallbackReason: string | null;
	  };

let keyring = $state<Keyring>({ status: 'unknown' });

/**
 * How long an enrolment offer stands before it is dropped.
 *
 * It exists to bound the one thing this feature costs: for as long as an offer
 * is open, the identity is in memory as a string on a device that would
 * otherwise hold only a `CryptoKey`. Five minutes is long enough to read a
 * callout and short enough that a tab left open overnight is not holding it.
 */
const ENROLMENT_WINDOW_MS = 5 * 60_000;

/**
 * The offer to add a passkey, made right after an unlock.
 *
 * Reactive, and deliberately holds no secret: a template can ask whether there
 * is an offer and for whom, and cannot reach the identity by accident. The
 * string itself sits in a plain module variable below, taken once.
 */
let enrolmentOffer = $state<{ userId: string; recipient: string } | null>(null);
let pendingIdentity: string | undefined;
let enrolmentTimer: ReturnType<typeof setTimeout> | undefined;
let initialisingForUserId: string | null = null;
let initialisingPromise: Promise<Keyring> | null = null;

/** The current keyring. Reactive: reading this in a template tracks it. */
export function currentKeyring(): Keyring {
	return keyring;
}

/** The identity, or null when locked. For the encrypt/decrypt helpers. */
export function unlockedIdentity(): { recipient: string; identity: CryptoKey | string } | null {
	return keyring.status === 'unlocked'
		? { recipient: keyring.recipient, identity: keyring.identity }
		: null;
}

async function cache(
	userId: string,
	recipient: string,
	identity: string,
	offer: { wraps: KeyWrapView[]; passkeyCount: number }
): Promise<Keyring> {
	const store = await keyStore();
	// The store decides what form to write and hands back the form to hold in
	// memory — a non-extractable CryptoKey wherever the browser can do X25519,
	// the string otherwise. See the tier ladder in `keystore.ts`.
	const cached = await store.putIdentity({ userId, recipient, identity });

	// This is the only moment the identity exists as bytes on a device that can
	// store a `CryptoKey` — `getIdentity` will hand back a non-extractable key
	// and nothing turns one of those into a string again. So if a passkey is
	// worth offering, it has to be offered now or it has to ask for the password
	// a second time. See docs/encryption.md.
	// A passkey has to already exist, and `passkeysAvailable()` does not say
	// that: the second says only that the browser has WebAuthn, and offering on
	// that alone puts a button in front of people with no passkey registered,
	// which opens a chooser with nothing in it. WebAuthn then reports that as a
	// plain `NotAllowedError` — the same one a dismissal gives — so it cannot be
	// explained afterwards either.
	if (
		offer.passkeyCount > 0 &&
		passkeysAvailable() &&
		!offer.wraps.some((wrap) => wrap.type === 'webauthn-prf')
	) {
		openEnrolmentOffer({ userId, recipient, identity });
	} else {
		dismissEnrolmentOffer();
	}

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
 * Tries every wrap of the right kind against a wrap key.
 *
 * Returns the identity and which wrap opened it, so the caller can note that
 * the wrap was used. More than one password wrap can legitimately exist — a
 * password change inserts the new one before changing the credential — so this
 * is a loop rather than a lookup.
 */
async function tryWraps(
	wraps: KeyWrapView[],
	recipient: string,
	wrapKeyFor: (params: KeyWrapParams) => Promise<CryptoKey | null>
): Promise<{ identity: string; wrapId: string } | null> {
	for (const wrap of wraps) {
		const wrapKey = await wrapKeyFor(wrap.params);
		if (!wrapKey) continue;
		const identity = await unwrapIdentity({ wrapKey, blob: wrap.blob, recipient });
		if (identity) return { identity, wrapId: wrap.id };
	}
	return null;
}

/**
 * Works out where this device stands, without asking for anything.
 *
 * Called once by `EncryptionGate` when the app shell mounts. Three ways it can
 * end up unlocked without a prompt: the identity is already cached; or the user
 * signed in moments ago and the wrap key is still in the stash; or there are no
 * keys at all, which is `absent` rather than locked.
 */
export async function initialiseKeyring(user: { id: string; email: string }): Promise<Keyring> {
	if (keyring.status !== 'unknown') return keyring;
	if (initialisingForUserId === user.id && initialisingPromise) return initialisingPromise;

	const run = (async (): Promise<Keyring> => {
		const storePromise = keyStore();
		const bundlePromise = fetchBundle();
		const store = await storePromise;

		const cached = await store.getIdentity(user.id);
		if (cached) {
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
		if (!bundle.recipient) {
			keyring = { status: 'absent' };
			return keyring;
		}

		// Handed over by the login or signup form a moment ago, so a fresh sign-in
		// does not ask for the same password twice in a row.
		const stashed = takeUnlock(normaliseEmail(user.email));
		if (stashed) {
			// Signup already has the identity in hand; login has to open a wrap.
			if (stashed.identity && stashed.recipient === bundle.recipient) {
				keyring = await cache(user.id, bundle.recipient, stashed.identity, bundle);
				return keyring;
			}
			const opened = await tryWraps(
				bundle.wraps.filter((wrap) => wrap.type === 'password'),
				bundle.recipient,
				async () => stashed.wrapKey
			);
			if (opened) {
				keyring = await cache(user.id, bundle.recipient, opened.identity, bundle);
				void noteWrapUsed(opened.wrapId);
				return keyring;
			}
		}

		keyring = {
			status: 'locked',
			recipient: bundle.recipient,
			wraps: bundle.wraps,
			reason: bundle.wraps.length === 0 ? 'no-usable-wrap' : 'cold',
			tier: store.tier,
			passkeyCount: bundle.passkeyCount,
			passkeysKnownUnusable: bundle.passkeysKnownUnusable,
			unusableProviderAaguid: bundle.unusableProviderAaguid
		};
		return keyring;
	})();

	initialisingForUserId = user.id;
	initialisingPromise = run.finally(() => {
		if (initialisingForUserId === user.id) {
			initialisingForUserId = null;
			initialisingPromise = null;
		}
	});

	return initialisingPromise;
}

/** Unlocks with the account password. The ordinary path on a new device. */
export async function unlockWithPassword(
	user: { id: string; email: string },
	password: string
): Promise<Keyring> {
	if (keyring.status !== 'locked') return keyring;
	const { recipient, wraps, passkeyCount } = keyring;

	// Cache the master key per parameter set: several wraps can share one, and
	// each derivation is 650,000 iterations. A plain object rather than a Map
	// because this is a scratch lookup inside one call and not state — a
	// SvelteMap here would add reactivity to something nothing observes.
	const masters: Record<string, MasterKey> = {};
	const opened = await tryWraps(
		wraps.filter((wrap) => wrap.type === 'password'),
		recipient,
		async (params) => {
			if (params.type !== 'password') return null;
			const cacheKey = `${params.version}:${params.iterations}`;
			masters[cacheKey] ??= await deriveMasterKey(password, user.email, {
				version: params.version,
				kdf: params.kdf,
				iterations: params.iterations
			});
			return deriveWrapKey(masters[cacheKey]);
		}
	);

	if (!opened) {
		// A local AES-GCM tag failure, with no server round trip — so a wrong
		// password is answered instantly and tells an observer nothing.
		keyring = { ...keyring, reason: 'wrong-password' };
		return keyring;
	}

	keyring = await cache(user.id, recipient, opened.identity, { wraps, passkeyCount });
	void noteWrapUsed(opened.wrapId);
	return keyring;
}

function openEnrolmentOffer(value: { userId: string; recipient: string; identity: string }) {
	clearTimeout(enrolmentTimer);
	enrolmentOffer = { userId: value.userId, recipient: value.recipient };
	pendingIdentity = value.identity;
	enrolmentTimer = setTimeout(dismissEnrolmentOffer, ENROLMENT_WINDOW_MS);
}

/** Whether to offer a passkey right now, and to whom. Reactive. */
export function currentEnrolmentOffer(): { userId: string; recipient: string } | null {
	return enrolmentOffer;
}

/** Drops the offer and the identity with it. Idempotent. */
export function dismissEnrolmentOffer(): void {
	clearTimeout(enrolmentTimer);
	enrolmentTimer = undefined;
	enrolmentOffer = null;
	pendingIdentity = undefined;
}

/**
 * The identity to seal to a passkey while the offer stands.
 *
 * Unlike `stash.ts` this is *not* cleared as it returns, and the difference is
 * deliberate: the stash guards against a second sign-in inheriting the first
 * one's key, which cannot happen here because the offer is keyed by user and
 * dropped on lock, on sign-out and on a timer. What can happen is a dismissed
 * Face ID sheet — the single most likely outcome of asking — and taking the
 * identity away on the first tap would mean the retry had to go and ask for
 * the password again. The caller dismisses the offer once it has succeeded.
 */
export function enrolmentIdentityFor(userId: string): string | null {
	return enrolmentOffer?.userId === userId ? (pendingIdentity ?? null) : null;
}

/**
 * The passkey wrap to offer on the unlock screen, or null when there is none.
 *
 * One, not all of them. Every attempt is a biometric prompt, so looping over
 * wraps the way `tryWraps` loops over password wraps would ask the user to
 * authenticate repeatedly to discover something they already know. The most
 * recently used one is the best guess at which passkey they still have.
 */
export function passkeyWrapFor(state: Keyring): KeyWrapView | null {
	if (state.status !== 'locked') return null;
	const candidates = state.wraps.filter((wrap) => wrap.type === 'webauthn-prf');
	if (candidates.length === 0) return null;
	return candidates.reduce((best, wrap) => (lastTouched(wrap) > lastTouched(best) ? wrap : best));
}

function lastTouched(wrap: KeyWrapView): number {
	return (wrap.lastUsedAt ?? wrap.createdAt).valueOf();
}

/**
 * Unlocks with a passkey: one touch instead of typing the password.
 *
 * Reached on exactly the devices the password prompt was reached on — an
 * evicted store, a new phone, a private tab — and it ends in `cache()`, so the
 * unlock persists through the storage ladder and the next load is silent.
 *
 * Throws whatever the ceremony threw, and leaves the keyring locked so the
 * password form underneath is still an option. `describePasskeyFailure` in
 * `passkey.ts` turns the error into something worth showing.
 */
export async function unlockWithPasskey(user: { id: string }, wrap: KeyWrapView): Promise<Keyring> {
	if (keyring.status !== 'locked') return keyring;
	if (wrap.params.type !== 'webauthn-prf') return keyring;
	const { recipient, wraps, passkeyCount } = keyring;

	const identity = await unwrapIdentityWithPasskey({
		blob: wrap.blob,
		rpId: wrap.params.rpId,
		// Present on wraps written since the credential binding landed, absent on
		// older ones — which then fall back to the platform's chooser.
		ageIdentity: wrap.params.ageIdentity
	});
	keyring = await cache(user.id, recipient, identity, { wraps, passkeyCount });
	void noteWrapUsed(wrap.id);
	return keyring;
}

/**
 * Forgets the identity on this device.
 *
 * Leaves the keyring at `unknown`, not `locked`, and that is deliberate: what
 * the device can do next depends on what the account still has, which is a
 * question for `initialiseKeyring`. `EncryptionGate` re-asks it whenever the
 * status goes back to `unknown`, so the screens settle on the right panel
 * without a reload.
 *
 * That re-ask is load-bearing rather than tidy. Without it the status stayed
 * `unknown` for the rest of the session: `/settings/encryption` showed no panel
 * at all after "Lock on this device", and — worse — the messaging board fell
 * through to rendering the board itself, every thread and message showing "…"
 * where the plaintext should be, because nothing on the page had been told the
 * device was locked.
 *
 * Note what this cannot do: another device that has already unlocked holds the
 * identity and needs neither the password nor this server to keep reading what
 * it has. Signing out revokes a session, not a key. See docs/encryption.md.
 */
export async function lock(userId: string): Promise<void> {
	clearStash();
	dismissEnrolmentOffer();
	keyring = { status: 'unknown' };
	initialisingForUserId = null;
	initialisingPromise = null;
	const store = await keyStore();
	await store.clear(userId);
}

/** Drops in-memory state without touching storage, e.g. on a user change. */
export function resetKeyring(): void {
	clearStash();
	dismissEnrolmentOffer();
	keyring = { status: 'unknown' };
	initialisingForUserId = null;
	initialisingPromise = null;
}

// ── server round trips ───────────────────────────────────────────────────────

async function fetchBundle(): Promise<UnlockBundleView> {
	const response = await fetch('/api/keys/unlock-bundle');
	if (!response.ok) throw new Error(`Could not load encryption keys (${response.status})`);
	return response.json();
}

/** Fire-and-forget: this is a display timestamp and gates nothing. */
async function noteWrapUsed(wrapId: string): Promise<void> {
	try {
		await fetch('/api/keys/wrap-used', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ wrapId })
		});
	} catch {
		// Not worth surfacing: the user is unlocked either way.
	}
}
