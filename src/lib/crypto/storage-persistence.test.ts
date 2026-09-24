import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyWrapParams } from '../encryption';
import type { KeyWrapView } from '../types';
import { resetX25519Probe } from './identity';
import { resetKeyStore } from './keystore';
import { currentKeyring, initialiseKeyring, lock, resetKeyring } from './session.svelte';
import { buildIdentitySubmission } from './setup';
import { stashUnlock } from './stash';
import {
	acceptStorageExplanation,
	dismissStorageExplanation,
	offerStorageExplanation,
	resetStorageExplanation,
	STORAGE_PERSISTENCE_ASKED_KEY,
	storageExplanationVisible
} from './storage-persistence.svelte';

/**
 * When the browser is asked to keep this origin's storage.
 *
 * The behaviour worth pinning down is that it is *never* asked unprompted:
 * not by the keystore's first write, not by an ordinary sign-in, and not by
 * the dialog closing. Firefox turns each of those into a permission prompt
 * with no explanation in front of it. Only a sign-in the app forced — because
 * the browser had cleared its storage — makes the explanation due.
 */

const ada = { id: 'user-ada', email: 'ada@example.com' };
const PASSWORD = 'correct horse battery staple';

let recipient: string;
let wrapKey: CryptoKey;
let passwordWrap: KeyWrapView;

beforeAll(async () => {
	const built = await buildIdentitySubmission(ada.email, PASSWORD);
	({ recipient, wrapKey } = built);
	passwordWrap = {
		id: 'wrap-password',
		type: 'password',
		params: JSON.parse(built.wrapParams) as KeyWrapParams,
		blob: built.wrapBlob,
		label: null,
		createdAt: new Date()
	} as KeyWrapView;
});

let persist: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let persisted: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let local: Map<string, string>;

function browser({ alreadyPersisted = false } = {}) {
	persist = vi.fn(async () => true);
	persisted = vi.fn(async () => alreadyPersisted);
	local = new Map();
	vi.stubGlobal('navigator', { storage: { persist, persisted }, platform: 'Test' });
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => local.get(key) ?? null,
		setItem: (key: string, value: string) => void local.set(key, value),
		removeItem: (key: string) => void local.delete(key)
	});
}

function bundleIs(wraps: KeyWrapView[]) {
	vi.stubGlobal(
		'fetch',
		vi.fn(() => Promise.resolve(Response.json({ recipient, wraps })))
	);
}

/** The explanation is decided after an await on `persisted()`, so let it land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Signs in with the password, as the login form hands it over. */
async function signIn(reason?: 'device') {
	bundleIs([passwordWrap]);
	stashUnlock({ kind: 'password', email: ada.email, wrapKey, ...(reason ? { reason } : {}) });
	await initialiseKeyring(ada);
	await settle();
}

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	resetKeyStore();
	resetX25519Probe();
	resetKeyring();
	resetStorageExplanation();
	browser();
});

afterEach(() => {
	resetKeyring();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe('which sign-ins make the explanation due', () => {
	it('one the app sent them back for does, and asks the browser nothing yet', async () => {
		await signIn('device');

		expect(currentKeyring().status).toBe('unlocked');
		expect(storageExplanationVisible()).toBe(true);
		expect(persist).not.toHaveBeenCalled();
	});

	it('an ordinary sign-in does not', async () => {
		await signIn();

		expect(currentKeyring().status).toBe('unlocked');
		expect(storageExplanationVisible()).toBe(false);
		// The old behaviour: the keystore's first durable write asked on its own.
		expect(persist).not.toHaveBeenCalled();
	});

	it('one held in memory only does not, since nothing is stored to keep', async () => {
		vi.stubGlobal('indexedDB', undefined);
		await signIn('device');

		expect(currentKeyring()).toMatchObject({ status: 'unlocked', durable: false });
		expect(storageExplanationVisible()).toBe(false);
	});

	it('signing out closes it', async () => {
		await signIn('device');
		await lock(ada.id);

		expect(storageExplanationVisible()).toBe(false);
	});
});

describe('when it is skipped', () => {
	it('when the browser already keeps this origin', async () => {
		browser({ alreadyPersisted: true });
		await offerStorageExplanation(true);
		expect(storageExplanationVisible()).toBe(false);
	});

	it('when the browser has no Storage API', async () => {
		vi.stubGlobal('navigator', { platform: 'Test' });
		await offerStorageExplanation(true);
		expect(storageExplanationVisible()).toBe(false);
	});

	it('once this device has pressed OK', async () => {
		await offerStorageExplanation(true);
		void acceptStorageExplanation();
		await offerStorageExplanation(true);
		expect(storageExplanationVisible()).toBe(false);
	});

	it('when localStorage throws, it offers rather than failing', async () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new DOMException('denied', 'SecurityError');
			}
		});
		await offerStorageExplanation(true);
		expect(storageExplanationVisible()).toBe(true);
	});

	it('when the user signs out while the offer is still deciding', async () => {
		const pending = offerStorageExplanation(true);
		dismissStorageExplanation();
		await pending;
		expect(storageExplanationVisible()).toBe(false);
	});
});

describe('answering it', () => {
	it('OK asks the browser once and remembers it did', async () => {
		await offerStorageExplanation(true);
		await acceptStorageExplanation();

		expect(persist).toHaveBeenCalledTimes(1);
		expect(local.has(STORAGE_PERSISTENCE_ASKED_KEY)).toBe(true);
		expect(storageExplanationVisible()).toBe(false);
	});

	it('dismissing asks nothing, remembers nothing, and it comes back next time', async () => {
		await offerStorageExplanation(true);
		dismissStorageExplanation();

		expect(persist).not.toHaveBeenCalled();
		expect(local.has(STORAGE_PERSISTENCE_ASKED_KEY)).toBe(false);
		expect(storageExplanationVisible()).toBe(false);

		await offerStorageExplanation(true);
		expect(storageExplanationVisible()).toBe(true);
	});
});
