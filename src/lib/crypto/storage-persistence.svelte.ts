/**
 * Asking the browser not to evict the key store — explained first, never cold.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * `navigator.storage.persist()` used to be called by the keystore straight
 * after its first durable write, which is the silent unlock right after signing
 * in. Chrome and Safari decide that from engagement without a word, but
 * Firefox shows a permission prompt — and a bare "allow this site to store
 * data in persistent storage?" seconds after typing a password reads like
 * something to refuse. So nothing asks on its own any more: an explicit unlock
 * makes an explanation due, `StoragePersistenceDialog` shows it, and only its
 * OK button asks the browser. `/settings/encryption` can ask again.
 *
 * Why an explicit unlock rather than any: it is the moment the cost of eviction
 * has just been felt — the user was asked for a password or a passkey because
 * storage was empty — and not the moment they finished signing in.
 */

/**
 * Set once this device has pressed OK, so the dialog is not shown again.
 *
 * Per origin rather than per user, because the permission is. Not set by a
 * dismissal: closing the dialog asks nothing, so it comes back on the next
 * explicit unlock.
 */
export const STORAGE_PERSISTENCE_ASKED_KEY = 'bound-up:storage-persistence-asked';

let due = $state(false);
let holds = $state(0);
/**
 * Bumped by every dismissal, so an offer still waiting on `persisted()` when
 * the device is locked does not reopen the dialog for a keyring that is gone.
 */
let generation = 0;

export type StoragePersistenceState = 'granted' | 'not-granted' | 'unsupported';

function storageManager(): StorageManager | undefined {
	return typeof navigator === 'undefined' ? undefined : navigator.storage;
}

function supported(storage: StorageManager | undefined): storage is StorageManager {
	return typeof storage?.persist === 'function' && typeof storage.persisted === 'function';
}

// Wrapped because localStorage throws outright in some private modes and
// under blocked site data; either way the answer is "not asked yet".
function askedBefore(): boolean {
	try {
		return globalThis.localStorage?.getItem(STORAGE_PERSISTENCE_ASKED_KEY) !== null;
	} catch {
		return false;
	}
}

function rememberAsked(): void {
	try {
		globalThis.localStorage?.setItem(STORAGE_PERSISTENCE_ASKED_KEY, new Date().toISOString());
	} catch {
		// Survivable: the dialog comes back after the next unlock.
	}
}

/** Whether the browser has already agreed not to evict this origin. */
export async function storagePersistenceState(): Promise<StoragePersistenceState> {
	const storage = storageManager();
	if (!supported(storage)) {
		return 'unsupported';
	}
	try {
		return (await storage.persisted()) ? 'granted' : 'not-granted';
	} catch {
		return 'not-granted';
	}
}

/**
 * Called after an explicit unlock. Makes the explanation due, unless there is
 * nothing worth explaining.
 *
 * `durable` false means the key is held in memory only; persisting storage
 * would keep nothing, so asking for it would be a prompt for no benefit.
 */
export async function offerStorageExplanation(durable: boolean): Promise<void> {
	if (!durable || askedBefore()) {
		return;
	}
	const offeredIn = generation;
	if ((await storagePersistenceState()) !== 'not-granted') {
		return;
	}
	if (offeredIn === generation) {
		due = true;
	}
}

/** Whether the dialog should be open right now. Reactive. */
export function storageExplanationVisible(): boolean {
	return due && holds === 0;
}

/**
 * Keeps the dialog shut until the returned release is called.
 *
 * For "unlock, then set up a passkey": the unlock makes the explanation due,
 * and opening it over the add-a-passkey dialogs would stack two modals in the
 * middle of a ceremony. Release is idempotent, so a flow that reports done
 * twice does not leave the count negative.
 */
export function holdStorageExplanation(): () => void {
	holds += 1;
	let released = false;
	return () => {
		if (released) {
			return;
		}
		released = true;
		holds -= 1;
	};
}

/**
 * The dialog's OK. Asks the browser, once, and remembers that it did.
 *
 * `persist()` is called before anything is awaited, and that is load-bearing:
 * Firefox only shows its prompt while the click's user activation is still
 * live, and an `await` in front of it would spend that for nothing.
 */
export function acceptStorageExplanation(): Promise<boolean> {
	due = false;
	rememberAsked();
	return requestStoragePersistence();
}

/** The dialog closed without OK: ask nothing, and offer again next unlock. */
export function dismissStorageExplanation(): void {
	due = false;
	generation += 1;
}

/**
 * Asks the browser not to evict this origin. Resolves to whether it agreed.
 *
 * Also what `/settings/encryption` calls directly, for a dismissed dialog or
 * a browser that said no the first time. Same user-activation rule as above.
 */
export function requestStoragePersistence(): Promise<boolean> {
	const storage = storageManager();
	if (!supported(storage)) {
		return Promise.resolve(false);
	}
	return storage.persist().catch(() => false);
}

/** Test seam: forget whether anything is due or held. */
export function resetStorageExplanation(): void {
	due = false;
	holds = 0;
	generation += 1;
}
