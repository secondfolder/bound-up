/**
 * Where an unlocked identity lives on this device.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * There are three ways to hold it, and the store picks the best one this
 * browser will actually perform, once, by trying it:
 *
 * 1. **`crypto-key`** — a **non-extractable** X25519 `CryptoKey`. The best
 *    outcome: `CryptoKey` is structured-cloneable, so it round-trips through
 *    IndexedDB with no serialisation, and once stored there is no API anywhere
 *    that turns it back into bytes. Script injected into the page can use the
 *    key for as long as it runs, but cannot walk away with it.
 * 2. **`sealed`** — the `AGE-SECRET-KEY-1…` string, AES-GCM sealed under a
 *    non-extractable device key that is itself stored here. Needed because
 *    WebCrypto X25519 only shipped in Safari 18.4 / iOS 18.4, and before that
 *    tier 1 is simply unavailable — yet `age-encryption` decrypts perfectly
 *    well from a *string* identity via `@noble/curves`. The trade-off is real
 *    and is written down in docs/encryption.md: injected script can call
 *    decrypt here and keep the identity, where tier 1 only lets it decrypt
 *    in-page. It is taken only on devices that would otherwise store nothing
 *    at all.
 * 3. **`memory`** — nothing persists and the user unlocks on every page load.
 *
 * Two things are treated as normal rather than exceptional, because they are:
 *
 * - **Not every browser can store a `CryptoKey`.** Some WebKit builds throw
 *   `DataCloneError` on structured-cloning one, and Safari's private browsing
 *   restricts IndexedDB outright. Hence the ladder, and `fallbackReason` so a
 *   support answer is a screenshot rather than a remote-inspector session.
 * - **Storage gets evicted.** iOS drops IndexedDB after about a week of
 *   inactivity, and any browser may evict under pressure. So the unlock prompt
 *   is a designed screen and not an error state.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { deviceSealAad } from '../encryption';
import { importIdentityKey, webCryptoX25519Available } from './identity';
import { seal, unseal } from './wrap';

const DB_NAME = 'bound-up-keys';
const DB_VERSION = 2;
const IDENTITY_STORE = 'identity';
const PIN_STORE = 'pins';
const DEVICE_STORE = 'device';

/** The device key's fixed slot. Versioned so a future format can coexist. */
const DEVICE_KEY_ID = 'identity-seal-v1';
/** The userId the probes write under. Not a valid Better Auth id. */
const PROBE_ID = '__probe__';

/** Which form this device can hold an identity in. See the file comment. */
export type KeyTier = 'crypto-key' | 'sealed' | 'memory';

/** An identity in the form the rest of the app uses it: never the raw row. */
export type CachedIdentity = {
	/** The user this identity belongs to, so a different login is not handed it. */
	userId: string;
	recipient: string;
	/**
	 * The private identity. A non-extractable `CryptoKey` where the browser can
	 * do X25519, otherwise the `AGE-SECRET-KEY-1…` string.
	 */
	key: CryptoKey | string;
};

/**
 * What actually sits in IndexedDB.
 *
 * Exactly one of `key` and `sealed` is set. Rows written before the sealed tier
 * existed have `key` and keep working untouched, which is why reads branch on
 * the row's shape rather than on the store's tier.
 */
type StoredIdentity = {
	userId: string;
	recipient: string;
	/** Tier 1: the non-extractable X25519 `CryptoKey` itself. */
	key?: CryptoKey;
	/** Tier 2: `seal()` of the identity string under the device key. */
	sealed?: string;
};

export type PinRow = {
	/** `${userId}:${partnershipId}`, so one device can hold several accounts' pins. */
	id: string;
	userId: string;
	partnershipId: string;
	recipient: string;
	pinnedAt: number;
	verifiedAt: number | null;
};

export type NewIdentityInput = {
	userId: string;
	recipient: string;
	/** The `AGE-SECRET-KEY-1…` string. The store decides what to write. */
	identity: string;
};

export type KeyStore = {
	getIdentity(userId: string): Promise<CachedIdentity | undefined>;
	/** Stores the identity in the best form available, and returns that form. */
	putIdentity(value: NewIdentityInput): Promise<CachedIdentity>;
	getPins(userId: string): Promise<PinRow[]>;
	putPin(row: PinRow): Promise<void>;
	/** Everything for one user, on sign-out. */
	clear(userId: string): Promise<void>;
	readonly tier: KeyTier;
	/** Whether writes actually persist. False means unlock repeats every load. */
	readonly durable: boolean;
	/**
	 * Why this device is not on `crypto-key`, or null when it is.
	 *
	 * Shown on /settings/encryption. `keyStore()` used to swallow every failure
	 * into one `catch`, which made "iOS asks me for my password every time"
	 * impossible to tell apart from an unsupported curve, a refused database and
	 * a `DataCloneError` without a remote inspector.
	 */
	readonly fallbackReason: string | null;
};

/**
 * The form to hold an identity in *in memory*, once it is known.
 *
 * A non-extractable `CryptoKey` wherever the browser can do X25519, even on the
 * sealed tier — the tier decides what is written to disk, not what is held in
 * a variable, and the `CryptoKey` is the form script cannot exfiltrate.
 */
async function inMemoryForm(identity: string): Promise<CryptoKey | string> {
	if (!(await webCryptoX25519Available())) return identity;
	try {
		return await importIdentityKey(identity);
	} catch {
		// Generate-and-derive worked but PKCS #8 import did not. Nothing in the
		// app requires the CryptoKey form, so this is a downgrade and not a
		// failure: age falls back to @noble/curves for a string identity.
		return identity;
	}
}

function describe(error: unknown): string {
	if (error instanceof DOMException || error instanceof Error) {
		return `${error.name}: ${error.message}`;
	}
	return String(error);
}

// ── the memory backend ───────────────────────────────────────────────────────

function createMemoryStore(fallbackReason: string | null = null): KeyStore {
	const identities = new Map<string, CachedIdentity>();
	const pins = new Map<string, PinRow>();

	return {
		tier: 'memory',
		durable: false,
		fallbackReason,
		async getIdentity(userId) {
			return identities.get(userId);
		},
		async putIdentity({ userId, recipient, identity }) {
			const value: CachedIdentity = { userId, recipient, key: await inMemoryForm(identity) };
			identities.set(userId, value);
			return value;
		},
		async getPins(userId) {
			return [...pins.values()].filter((row) => row.userId === userId);
		},
		async putPin(row) {
			pins.set(row.id, row);
		},
		async clear(userId) {
			identities.delete(userId);
			for (const [id, row] of pins) if (row.userId === userId) pins.delete(id);
		}
	};
}

// ── the IndexedDB backend ────────────────────────────────────────────────────

interface KeyDb extends DBSchema {
	[IDENTITY_STORE]: { key: string; value: StoredIdentity };
	[PIN_STORE]: { key: string; value: PinRow; indexes: { userId: string } };
	[DEVICE_STORE]: { key: string; value: CryptoKey };
}

function openDatabase(): Promise<IDBPDatabase<KeyDb>> {
	// A version change held open by another tab must not hang the unlock screen
	// forever, and `openDB` keeps waiting after `blocked` fires — so race it.
	// The other tab closing is not handled: it is rare, it is one page load, and
	// the fallback is a store that works and an unlock prompt.
	let onBlocked!: (error: Error) => void;
	const blocked = new Promise<never>((_, reject) => {
		onBlocked = reject;
	});

	const open = openDB<KeyDb>(DB_NAME, DB_VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
				db.createObjectStore(IDENTITY_STORE, { keyPath: 'userId' });
			}
			if (!db.objectStoreNames.contains(PIN_STORE)) {
				db.createObjectStore(PIN_STORE, { keyPath: 'id' }).createIndex('userId', 'userId');
			}
			// Added in v2. Out-of-line keys: a CryptoKey has no property to key on.
			if (!db.objectStoreNames.contains(DEVICE_STORE)) {
				db.createObjectStore(DEVICE_STORE);
			}
		},
		blocked() {
			onBlocked(new Error('IndexedDB open was blocked'));
		}
	});

	return Promise.race([open, blocked]);
}

/**
 * The AES-GCM key the sealed tier seals under.
 *
 * One per browser profile, shared by every account signed in on it — it is not
 * a secret anyone can reach, it exists to be unextractable. Never rotated:
 * rotating it would strand the sealed identity for no gain.
 */
async function deviceKey(db: IDBPDatabase<KeyDb>): Promise<CryptoKey> {
	const existing = await db.get(DEVICE_STORE, DEVICE_KEY_ID);
	if (existing) return existing;

	// Generated *before* the transaction opens: awaiting a non-IndexedDB promise
	// inside one lets it auto-commit out from under the rest of the work. The
	// get-then-put below therefore run in a single transaction, which is what
	// stops two tabs racing to generate different keys and one of them writing
	// last — a sealed identity nobody can open.
	const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
		'encrypt',
		'decrypt'
	]);

	const tx = db.transaction(DEVICE_STORE, 'readwrite');
	const raced = await tx.store.get(DEVICE_KEY_ID);
	if (raced) {
		await tx.done;
		return raced;
	}
	await tx.store.put(candidate, DEVICE_KEY_ID);
	await tx.done;
	return candidate;
}

let persistenceRequested = false;

/**
 * Ask the browser not to evict this origin, once.
 *
 * Best effort and deliberately not awaited. Chrome and Safari decide silently
 * from engagement — Safari usually says no unless the site is on the Home
 * Screen — while Firefox may show a permission prompt, which is the one reason
 * this is worth a second thought. It changes nothing when denied.
 */
function requestPersistence(): void {
	if (persistenceRequested) return;
	persistenceRequested = true;
	void navigator.storage?.persist?.().catch(() => {});
}

function createIndexedDbStore(
	db: IDBPDatabase<KeyDb>,
	tier: 'crypto-key' | 'sealed',
	fallbackReason: string | null
): KeyStore {
	return {
		tier,
		durable: true,
		fallbackReason,

		async getIdentity(userId) {
			const row = await db.get(IDENTITY_STORE, userId);
			if (!row) return undefined;

			// On the row's shape, not on `tier`: a device that has just been
			// promoted to tier 1 by an OS update still has to read what it sealed.
			if (row.key instanceof CryptoKey) {
				return { userId: row.userId, recipient: row.recipient, key: row.key };
			}
			if (typeof row.sealed !== 'string') return undefined;

			const identity = await unseal({
				key: await deviceKey(db),
				blob: row.sealed,
				aad: deviceSealAad(row.userId, row.recipient)
			});
			if (identity === null) {
				// The device key is gone or was replaced. This row will never open
				// again, so drop it rather than let every load retry it.
				await db.delete(IDENTITY_STORE, userId);
				return undefined;
			}
			return { userId: row.userId, recipient: row.recipient, key: await inMemoryForm(identity) };
		},

		async putIdentity({ userId, recipient, identity }) {
			if (tier === 'crypto-key') {
				const key = await importIdentityKey(identity);
				await db.put(IDENTITY_STORE, { userId, recipient, key });
				requestPersistence();
				return { userId, recipient, key };
			}

			const sealed = await seal({
				key: await deviceKey(db),
				plaintext: identity,
				aad: deviceSealAad(userId, recipient)
			});
			await db.put(IDENTITY_STORE, { userId, recipient, sealed });
			requestPersistence();
			return { userId, recipient, key: await inMemoryForm(identity) };
		},

		async getPins(userId) {
			return db.getAllFromIndex(PIN_STORE, 'userId', userId);
		},

		async putPin(row) {
			await db.put(PIN_STORE, row);
		},

		async clear(userId) {
			// The device key is deliberately left alone: another account signed in
			// on this browser may still have an identity sealed under it.
			await db.delete(IDENTITY_STORE, userId);
			for (const row of await db.getAllFromIndex(PIN_STORE, 'userId', userId)) {
				await db.delete(PIN_STORE, row.id);
			}
		}
	};
}

// ── choosing a tier ──────────────────────────────────────────────────────────

/** Writes a value, reads it back, and cleans up. Returns null when it worked. */
async function probeClone(
	db: IDBPDatabase<KeyDb>,
	write: () => Promise<CryptoKey | undefined>
): Promise<string | null> {
	try {
		const readBack = await write();
		return readBack instanceof CryptoKey ? null : 'read back something other than a CryptoKey';
	} catch (error) {
		return describe(error);
	} finally {
		try {
			await db.delete(IDENTITY_STORE, PROBE_ID);
			await db.delete(DEVICE_STORE, PROBE_ID);
		} catch {
			// Nothing was written, or the store is refusing writes entirely. Either
			// way the probe's own answer is the one that matters.
		}
	}
}

/**
 * Which tier this device gets, and why it is not the best one.
 *
 * The probes are real writes and reads, because `indexedDB` being defined says
 * nothing about whether it will clone a key, and — per age-encryption's own
 * source — Bun implements `importKey` for X25519 but not `deriveBits`, so
 * anything short of actually using the algorithm reports support that is not
 * there.
 */
async function chooseTier(
	db: IDBPDatabase<KeyDb>
): Promise<
	{ tier: 'crypto-key' | 'sealed'; reason: string | null } | { tier: 'memory'; reason: string }
> {
	// A device that already holds a tier-1 row has proved it can round-trip a
	// CryptoKey, so it is not made to prove it again on every cold start. A
	// *sealed* row proves no such thing, and re-probing is what lets a device
	// climb to tier 1 after an OS update, so that case falls through.
	const rows = await db.getAll(IDENTITY_STORE);
	if (rows.some((row) => row.userId !== PROBE_ID && row.key instanceof CryptoKey)) {
		return { tier: 'crypto-key', reason: null };
	}

	const cryptoKeyFailure = await probeClone(db, async () => {
		const pair = (await crypto.subtle.generateKey({ name: 'X25519' }, false, [
			'deriveBits'
		])) as CryptoKeyPair;
		await db.put(IDENTITY_STORE, {
			userId: PROBE_ID,
			recipient: 'probe',
			key: pair.privateKey
		});
		return (await db.get(IDENTITY_STORE, PROBE_ID))?.key;
	});
	if (cryptoKeyFailure === null) return { tier: 'crypto-key', reason: null };

	const sealedFailure = await probeClone(db, async () => {
		const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
			'encrypt',
			'decrypt'
		]);
		await db.put(DEVICE_STORE, key, PROBE_ID);
		return db.get(DEVICE_STORE, PROBE_ID);
	});
	if (sealedFailure === null) return { tier: 'sealed', reason: cryptoKeyFailure };

	return { tier: 'memory', reason: `${cryptoKeyFailure} (and AES-GCM: ${sealedFailure})` };
}

let storePromise: Promise<KeyStore> | undefined;

/** The store for this device, probed once. */
export function keyStore(): Promise<KeyStore> {
	return (storePromise ??= (async () => {
		if (typeof indexedDB === 'undefined') return createMemoryStore('no-indexeddb');

		try {
			const db = await openDatabase();
			const { tier, reason } = await chooseTier(db);
			if (tier === 'memory') return createMemoryStore(reason);
			return createIndexedDbStore(db, tier, reason);
		} catch (error) {
			// A blocked open, private browsing, a quota refusal — all of them mean
			// the same thing here, and all of them are survivable.
			return createMemoryStore(describe(error));
		}
	})());
}

/** Test seam: forget the probed backend. */
export function resetKeyStore(): void {
	storePromise = undefined;
	persistenceRequested = false;
}

export { createMemoryStore };
