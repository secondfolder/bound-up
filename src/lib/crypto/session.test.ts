import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyWrapParams } from '../encryption';
import type { KeyWrapView } from '../types';
import { resetX25519Probe } from './identity';
import { keyStore, resetKeyStore } from './keystore';
import { wrapIdentityToPasskey } from './passkey-wraps';
import { currentKeyring, initialiseKeyring, lock, resetKeyring } from './session.svelte';
import { buildIdentitySubmission } from './setup';
import { stashUnlock } from './stash';

/**
 * Signing in is what unlocks.
 *
 * Every path into the app — password, a PRF passkey, a passkey whose provider
 * would not do PRF — hands the sign-in's secret over through the stash, and
 * `initialiseKeyring` opens the identity with it. A device that got nothing
 * handed over ends up `locked`, which the gate turns into signing in again;
 * one that got a secret that opened nothing is a bug, flagged so the gate does
 * not send the user round in a circle.
 */

const ada = { id: 'user-ada', email: 'ada@example.com' };
const PASSWORD = 'correct horse battery staple';
const counting = (from: number) => new Uint8Array(32).map((_, i) => i + from);

let identity: string;
let recipient: string;
let wrapKey: CryptoKey;
let passwordWrap: KeyWrapView;
let prfWrap: KeyWrapView;
let handleWrap: KeyWrapView;

function view(id: string, params: KeyWrapParams, blob: string): KeyWrapView {
	return { id, type: params.type, params, blob, label: null, createdAt: new Date() };
}

beforeAll(async () => {
	const built = await buildIdentitySubmission(ada.email, PASSWORD);
	({ identity, recipient, wrapKey } = built);
	passwordWrap = view('wrap-password', JSON.parse(built.wrapParams), built.wrapBlob);
	const prf = await wrapIdentityToPasskey({
		type: 'passkey-prf',
		secret: counting(1),
		identity,
		recipient,
		credentialId: 'cred-prf',
		rpId: 'bound-up.test'
	});
	prfWrap = view('wrap-prf', prf.params, prf.blob);
	const handle = await wrapIdentityToPasskey({
		type: 'passkey-handle',
		secret: counting(100),
		identity,
		recipient,
		credentialId: 'cred-handle',
		rpId: 'bound-up.test'
	});
	handleWrap = view('wrap-handle', handle.params, handle.blob);
});

let served: { recipient: string; wraps: KeyWrapView[] };

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	resetKeyStore();
	resetX25519Probe();
	resetKeyring();
	served = { recipient, wraps: [passwordWrap, prfWrap, handleWrap] };
	vi.stubGlobal(
		'fetch',
		vi.fn(() => Promise.resolve(Response.json(served)))
	);
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	resetKeyring();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('signing in unlocks', () => {
	it('with a password', async () => {
		stashUnlock({ kind: 'password', email: ada.email, wrapKey });
		await initialiseKeyring(ada);
		expect(currentKeyring()).toMatchObject({ status: 'unlocked', recipient, durable: true });
	});

	it('with signup, which already has the identity in hand', async () => {
		stashUnlock({ kind: 'password', email: ada.email, wrapKey, identity, recipient });
		await initialiseKeyring(ada);
		expect(currentKeyring()).toMatchObject({ status: 'unlocked', recipient });
	});

	it('with a passkey that returned PRF output', async () => {
		stashUnlock({ kind: 'passkey', credentialId: 'cred-prf', prf: counting(1), handle: null });
		await initialiseKeyring(ada);
		expect(currentKeyring()).toMatchObject({ status: 'unlocked', recipient });
	});

	it('with a passkey whose provider would not do PRF, through its user handle', async () => {
		stashUnlock({
			kind: 'passkey',
			credentialId: 'cred-handle',
			prf: null,
			handle: counting(100)
		});
		await initialiseKeyring(ada);
		expect(currentKeyring()).toMatchObject({ status: 'unlocked', recipient });
	});

	it('and keeps it, so the next load needs no sign-in', async () => {
		stashUnlock({ kind: 'password', email: ada.email, wrapKey });
		await initialiseKeyring(ada);
		resetKeyring();

		await initialiseKeyring(ada);
		expect(currentKeyring()).toMatchObject({ status: 'unlocked', recipient });
	});
});

describe('a device without its key', () => {
	it('is locked when nothing was handed over, so the gate sends it to sign in', async () => {
		await initialiseKeyring(ada);
		expect(currentKeyring()).toEqual({ status: 'locked', signInFailed: false });
	});

	it('is flagged, not silently locked, when a sign-in handed over a secret that opened nothing', async () => {
		stashUnlock({ kind: 'passkey', credentialId: 'cred-prf', prf: counting(9), handle: null });
		await initialiseKeyring(ada);
		expect(currentKeyring()).toEqual({ status: 'locked', signInFailed: true });
	});

	it('ignores a password stash for a different account', async () => {
		stashUnlock({ kind: 'password', email: 'jun@example.com', wrapKey });
		await initialiseKeyring(ada);
		expect(currentKeyring()).toEqual({ status: 'locked', signInFailed: false });
	});

	/**
	 * A partner-assisted sign-in on another device replaces the identity. This
	 * one must not keep decrypting with a key nothing is encrypted to any more.
	 */
	it('drops a cached key the server no longer serves', async () => {
		stashUnlock({ kind: 'password', email: ada.email, wrapKey });
		await initialiseKeyring(ada);
		resetKeyring();

		served = { recipient: 'age1replaced', wraps: [] };
		await initialiseKeyring(ada);
		await vi.waitFor(() =>
			expect(currentKeyring()).toEqual({ status: 'locked', signInFailed: false })
		);
		await expect((await keyStore()).getIdentity(ada.id)).resolves.toBeUndefined();
	});
});

describe('signing out', () => {
	it('forgets the key on this device', async () => {
		stashUnlock({ kind: 'password', email: ada.email, wrapKey });
		await initialiseKeyring(ada);
		await lock(ada.id);

		expect(currentKeyring()).toEqual({ status: 'signed-out' });
		await expect((await keyStore()).getIdentity(ada.id)).resolves.toBeUndefined();
	});

	/**
	 * `signed-out` is inert on purpose — reacting to it raced the sign-out — so
	 * the next sign-in in the same tab has to start from scratch rather than
	 * find it and stop.
	 */
	it('lets the next sign-in start afresh', async () => {
		await lock(ada.id);
		stashUnlock({ kind: 'password', email: ada.email, wrapKey });
		await initialiseKeyring(ada);
		expect(currentKeyring()).toMatchObject({ status: 'unlocked', recipient });
	});
});
