import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetX25519Probe } from './identity';
import { resetKeyStore } from './keystore';
import { buildIdentitySubmission } from './setup';
import {
	currentKeyring,
	initialiseKeyring,
	lock,
	resetKeyring,
	unlockWithPasskey,
	unlockWithPassword
} from './session.svelte';
import { stashUnlock } from './stash';
import {
	acceptStorageExplanation,
	dismissStorageExplanation,
	holdStorageExplanation,
	offerStorageExplanation,
	resetStorageExplanation,
	STORAGE_PERSISTENCE_ASKED_KEY,
	storageExplanationVisible
} from './storage-persistence.svelte';
import type { KeyWrapParams } from '../encryption';
import type { KeyWrapView } from '../types';

vi.mock('./passkey', async (importOriginal) => ({
	...(await importOriginal<typeof import('./passkey')>()),
	unwrapIdentityWithPasskey: vi.fn()
}));

/**
 * When the browser is asked to keep this origin's storage.
 *
 * The behaviour worth pinning down is that it is *never* asked unprompted:
 * not by the keystore's first write, not by the silent unlock after signing
 * in, and not by the dialog closing. Firefox turns each of those into a
 * permission prompt with no explanation in front of it.
 */

const ada = { id: 'user-ada', email: 'ada@example.com' };
const PASSWORD = 'correct horse battery staple';

let identity: string;
let recipient: string;
let passwordWrap: KeyWrapView;

const PASSKEY_WRAP = {
	id: 'wrap-passkey',
	type: 'webauthn-prf',
	params: { type: 'webauthn-prf', version: 1, rpId: 'bound-up.test' },
	blob: 'x'.repeat(40),
	label: null,
	lastUsedAt: null,
	createdAt: new Date()
} as KeyWrapView;

beforeAll(async () => {
	const built = await buildIdentitySubmission(ada.email, PASSWORD);
	({ identity, recipient } = built);
	passwordWrap = {
		id: 'wrap-password',
		type: 'password',
		params: JSON.parse(built.wrapParams) as KeyWrapParams,
		blob: built.wrapBlob,
		label: null,
		lastUsedAt: null,
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
		vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						recipient,
						wraps,
						passkeyCount: 0,
						passkeysKnownUnusable: 0,
						unusableProviderAaguid: null
					})
				)
		)
	);
}

/** The explanation is decided after an await on `persisted()`, so let it land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function lockedDevice(wraps: KeyWrapView[] = [passwordWrap]) {
	bundleIs(wraps);
	await initialiseKeyring(ada);
	expect(currentKeyring().status).toBe('locked');
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

describe('which unlocks make the explanation due', () => {
	it('a password unlock does, and asks the browser nothing yet', async () => {
		await lockedDevice();
		await unlockWithPassword(ada, PASSWORD);
		await settle();

		expect(currentKeyring().status).toBe('unlocked');
		expect(storageExplanationVisible()).toBe(true);
		expect(persist).not.toHaveBeenCalled();
	});

	it('a passkey unlock does', async () => {
		const { unwrapIdentityWithPasskey } = await import('./passkey');
		vi.mocked(unwrapIdentityWithPasskey).mockResolvedValue(identity);
		await lockedDevice([PASSKEY_WRAP]);
		await unlockWithPasskey(ada, PASSKEY_WRAP);
		await settle();

		expect(currentKeyring().status).toBe('unlocked');
		expect(storageExplanationVisible()).toBe(true);
		expect(persist).not.toHaveBeenCalled();
	});

	it('the silent unlock after signing in does not', async () => {
		bundleIs([passwordWrap]);
		stashUnlock({
			email: ada.email,
			wrapKey: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
				'encrypt',
				'decrypt'
			]),
			identity,
			recipient
		});
		await initialiseKeyring(ada);
		await settle();

		expect(currentKeyring().status).toBe('unlocked');
		expect(storageExplanationVisible()).toBe(false);
		// The old behaviour: the keystore's first durable write asked on its own.
		expect(persist).not.toHaveBeenCalled();
	});

	it('a wrong password does not', async () => {
		await lockedDevice();
		await unlockWithPassword(ada, 'not the password');
		await settle();

		expect(currentKeyring().status).toBe('locked');
		expect(storageExplanationVisible()).toBe(false);
	});

	it('an unlock held in memory only does not, since nothing is stored to keep', async () => {
		vi.stubGlobal('indexedDB', undefined);
		await lockedDevice();
		await unlockWithPassword(ada, PASSWORD);
		await settle();

		expect(currentKeyring()).toMatchObject({ status: 'unlocked', durable: false });
		expect(storageExplanationVisible()).toBe(false);
	});

	it('locking closes it', async () => {
		await lockedDevice();
		await unlockWithPassword(ada, PASSWORD);
		await settle();
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

	it('when the device is locked while the offer is still deciding', async () => {
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

	it('dismissing asks nothing, remembers nothing, and it comes back next unlock', async () => {
		await offerStorageExplanation(true);
		dismissStorageExplanation();

		expect(persist).not.toHaveBeenCalled();
		expect(local.has(STORAGE_PERSISTENCE_ASKED_KEY)).toBe(false);
		expect(storageExplanationVisible()).toBe(false);

		await offerStorageExplanation(true);
		expect(storageExplanationVisible()).toBe(true);
	});

	it('stays shut while held, and opens when released', async () => {
		await offerStorageExplanation(true);
		const release = holdStorageExplanation();
		expect(storageExplanationVisible()).toBe(false);

		release();
		release(); // idempotent — a second call must not unbalance the count
		expect(storageExplanationVisible()).toBe(true);

		const again = holdStorageExplanation();
		expect(storageExplanationVisible()).toBe(false);
		again();
	});
});
