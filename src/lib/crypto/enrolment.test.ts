import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAgeIdentity, resetX25519Probe } from './identity';
import { resetKeyStore } from './keystore';
import {
	currentEnrolmentOffer,
	currentKeyring,
	dismissEnrolmentOffer,
	enrolmentIdentityFor,
	initialiseKeyring,
	lock,
	resetKeyring
} from './session.svelte';
import { stashUnlock } from './stash';
import type { KeyWrapView } from '../types';

/**
 * The window in which a passkey can be offered for free.
 *
 * The behaviour worth pinning down is not that a callout appears — it is which
 * unlocks leave the identity available to seal, and that it stops being
 * available when it should. Getting the second half wrong would leave the
 * `AGE-SECRET-KEY-1…` string in memory on a device that had deliberately
 * reduced it to a non-extractable `CryptoKey`.
 */

const ada = { id: 'user-ada', email: 'ada@example.com' };
let identity: string;
let recipient: string;

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
	({ identity, recipient } = await generateAgeIdentity());
});

/** A browser that has WebAuthn, which is what makes an offer worth making. */
function browserWithPasskeys() {
	vi.stubGlobal('window', { location: { hostname: 'bound-up.test' } });
	vi.stubGlobal('PublicKeyCredential', class {});
	vi.stubGlobal('navigator', { credentials: {}, platform: 'Test' });
}

function bundleIs(wraps: KeyWrapView[]) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify({ recipient, wraps })))
	);
}

/** Signing in: the form hands the identity over through the stash. */
async function signInAs(user = ada) {
	stashUnlock({
		email: user.email,
		wrapKey: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
			'encrypt',
			'decrypt'
		]),
		identity,
		recipient
	});
	return initialiseKeyring(user);
}

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	resetKeyStore();
	resetX25519Probe();
	resetKeyring();
	browserWithPasskeys();
	bundleIs([]);
});

afterEach(() => {
	resetKeyring();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('the offer after an unlock', () => {
	it('opens when the account has no passkey yet', async () => {
		await signInAs();

		expect(currentKeyring().status).toBe('unlocked');
		expect(currentEnrolmentOffer()).toEqual({ userId: ada.id, recipient });
		expect(enrolmentIdentityFor(ada.id)).toBe(identity);
	});

	it('stays shut when the account already has a passkey', async () => {
		bundleIs([PASSKEY_WRAP]);
		await signInAs();

		expect(currentKeyring().status).toBe('unlocked');
		expect(currentEnrolmentOffer()).toBeNull();
		expect(enrolmentIdentityFor(ada.id)).toBeNull();
	});

	it('stays shut on a browser with no WebAuthn at all', async () => {
		vi.stubGlobal('PublicKeyCredential', undefined);
		await signInAs();

		expect(currentKeyring().status).toBe('unlocked');
		expect(currentEnrolmentOffer()).toBeNull();
	});

	it('is not opened by an unlock that read the identity back from storage', async () => {
		await signInAs();
		dismissEnrolmentOffer();

		// A cold start against the same device: the identity comes back from
		// IndexedDB, as a key rather than a string, so there is nothing to offer.
		resetKeyring();
		resetKeyStore();
		await initialiseKeyring(ada);

		expect(currentKeyring().status).toBe('unlocked');
		expect(currentEnrolmentOffer()).toBeNull();
	});
});

describe('closing the window', () => {
	it('survives a first refusal, so a dismissed sheet can be retried', async () => {
		await signInAs();

		// What the component does when the ceremony throws: nothing.
		expect(enrolmentIdentityFor(ada.id)).toBe(identity);
		expect(enrolmentIdentityFor(ada.id)).toBe(identity);
		expect(currentEnrolmentOffer()).not.toBeNull();
	});

	it('gives nothing to a different account', async () => {
		await signInAs();
		expect(enrolmentIdentityFor('user-jun')).toBeNull();
	});

	it('drops the identity when dismissed', async () => {
		await signInAs();
		dismissEnrolmentOffer();

		expect(currentEnrolmentOffer()).toBeNull();
		expect(enrolmentIdentityFor(ada.id)).toBeNull();
	});

	it('drops the identity on sign-out', async () => {
		await signInAs();
		await lock(ada.id);

		expect(currentEnrolmentOffer()).toBeNull();
		expect(enrolmentIdentityFor(ada.id)).toBeNull();
	});

	it('closes on its own, so a tab left open is not holding the identity', async () => {
		// Only the timer, not the whole clock: fake-indexeddb drives its requests
		// off `setImmediate`, and faking that deadlocks the unlock above.
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		await signInAs();
		expect(currentEnrolmentOffer()).not.toBeNull();

		vi.advanceTimersByTime(5 * 60_000);

		expect(currentEnrolmentOffer()).toBeNull();
		expect(enrolmentIdentityFor(ada.id)).toBeNull();
	});
});
