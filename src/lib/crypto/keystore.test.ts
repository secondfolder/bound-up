import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defined } from '$lib/testing/defined';
import { generateAgeIdentity, resetX25519Probe } from './identity';
import { keyStore, type PinRow, resetKeyStore } from './keystore';

/**
 * The tier ladder, against a real IndexedDB implementation.
 *
 * Node clones a `CryptoKey` happily, so the unforced case lands on tier 1 —
 * which is the *opposite* of the browsers this ladder exists for. Tiers 2 and 3
 * are therefore reached by making the thing that fails on those browsers fail
 * here too: `generateKey` for X25519 throwing is exactly what an iOS before
 * 18.4 does.
 */

let identity: string;
let recipient: string;

const ada = 'user-ada';
const bob = 'user-bob';

beforeAll(async () => {
	// Generated once, before any stubbing, so a test that breaks X25519 still
	// has a real `AGE-SECRET-KEY-1…` to work with.
	({ identity, recipient } = await generateAgeIdentity());
});

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	resetKeyStore();
	resetX25519Probe();
});

afterEach(() => {
	vi.restoreAllMocks();
});

/** Makes this "browser" one that cannot do X25519 in WebCrypto. */
function breakX25519() {
	const real = crypto.subtle.generateKey.bind(crypto.subtle);
	vi.spyOn(crypto.subtle, 'generateKey').mockImplementation(((
		algorithm: AlgorithmIdentifier,
		...rest: unknown[]
	) => {
		const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
		if (name === 'X25519') {
			throw new DOMException('Unrecognized algorithm name', 'NotSupportedError');
		}
		return real(algorithm as AlgorithmIdentifier, ...(rest as [boolean, KeyUsage[]]));
	}) as typeof crypto.subtle.generateKey);
}

/** Reads the row as it actually sits on disk, past the store's own accessors. */
async function rawIdentityRow(userId: string) {
	const db = await openDB('bound-up-keys');
	try {
		return (await db.get('identity', userId)) as
			| { userId: string; recipient: string; key?: CryptoKey; sealed?: string }
			| undefined;
	} finally {
		db.close();
	}
}

function pin(userId: string, partnershipId: string): PinRow {
	return {
		id: `${userId}:${partnershipId}`,
		userId,
		partnershipId,
		recipient: 'age1theirs',
		pinnedAt: 1,
		verifiedAt: null
	};
}

describe('tier crypto-key', () => {
	it('stores the identity as a non-extractable CryptoKey', async () => {
		const store = await keyStore();
		expect(store.tier).toBe('crypto-key');
		expect(store.durable).toBe(true);
		expect(store.fallbackReason).toBeNull();

		const cached = await store.putIdentity({ userId: ada, recipient, identity });
		expect(cached.key).toBeInstanceOf(CryptoKey);
		expect((cached.key as CryptoKey).extractable).toBe(false);

		const row = await rawIdentityRow(ada);
		expect(row?.key).toBeInstanceOf(CryptoKey);
		expect(row?.sealed).toBeUndefined();
	});

	it('hands the same identity back on a cold start', async () => {
		const first = await keyStore();
		await first.putIdentity({ userId: ada, recipient, identity });

		resetKeyStore();
		const cold = await keyStore();
		const cached = await cold.getIdentity(ada);
		expect(cached?.recipient).toBe(recipient);
		expect(cached?.key).toBeInstanceOf(CryptoKey);
	});

	it('adopts the tier from an existing row without probing again', async () => {
		const first = await keyStore();
		await first.putIdentity({ userId: ada, recipient, identity });

		resetKeyStore();
		const generateKey = vi.spyOn(crypto.subtle, 'generateKey');
		const cold = await keyStore();
		expect(cold.tier).toBe('crypto-key');
		// The whole point of the shortcut: no X25519 keypair on every page load.
		expect(generateKey).not.toHaveBeenCalled();
	});
});

describe('tier sealed', () => {
	beforeEach(breakX25519);

	it('falls back to sealing the identity string, and says why', async () => {
		const store = await keyStore();
		expect(store.tier).toBe('sealed');
		expect(store.durable).toBe(true);
		expect(store.fallbackReason).toContain('NotSupportedError');
	});

	it('writes no key material a script could read back', async () => {
		const store = await keyStore();
		await store.putIdentity({ userId: ada, recipient, identity });

		const row = await rawIdentityRow(ada);
		expect(row?.key).toBeUndefined();
		expect(typeof row?.sealed).toBe('string');
		expect(row?.sealed).not.toContain(identity);
	});

	it('unseals the identity on a cold start', async () => {
		const first = await keyStore();
		const cached = await first.putIdentity({ userId: ada, recipient, identity });
		// No X25519, so the in-memory form is the string age opens with @noble.
		expect(cached.key).toBe(identity);

		resetKeyStore();
		const cold = await keyStore();
		expect(cold.tier).toBe('sealed');
		await expect(cold.getIdentity(ada)).resolves.toMatchObject({ recipient, key: identity });
	});

	it('refuses a row whose recipient has been swapped, and drops it', async () => {
		const store = await keyStore();
		await store.putIdentity({ userId: ada, recipient, identity });

		const row = await rawIdentityRow(ada);
		const db = await openDB('bound-up-keys');
		await db.put('identity', {
			...defined(row, 'the stored identity row'),
			recipient: 'age1someone-else'
		});
		db.close();

		resetKeyStore();
		const cold = await keyStore();
		// The AAD binds the seal to the account and the public key, so this is a
		// failed tag check rather than someone else's identity.
		await expect(cold.getIdentity(ada)).resolves.toBeUndefined();
		await expect(rawIdentityRow(ada)).resolves.toBeUndefined();
	});

	it('promotes a device to tier 1 once X25519 works', async () => {
		const sealed = await keyStore();
		await sealed.putIdentity({ userId: ada, recipient, identity });

		// An OS update, in one line.
		vi.restoreAllMocks();
		resetKeyStore();
		resetX25519Probe();

		const promoted = await keyStore();
		expect(promoted.tier).toBe('crypto-key');
		// The old sealed row still opens: reads go on the row's shape, not the tier.
		await expect(promoted.getIdentity(ada)).resolves.toMatchObject({ recipient });
	});
});

describe('tier memory', () => {
	it('is used when there is no IndexedDB at all', async () => {
		const real = globalThis.indexedDB;
		// Modelling a browser that withholds it entirely.
		Reflect.deleteProperty(globalThis, 'indexedDB');
		try {
			const store = await keyStore();
			expect(store.tier).toBe('memory');
			expect(store.durable).toBe(false);
			expect(store.fallbackReason).toBe('no-indexeddb');

			// Still the unstealable form in memory: the tier decides what reaches
			// disk, not what a variable holds.
			const cached = await store.putIdentity({ userId: ada, recipient, identity });
			expect(cached.key).toBeInstanceOf(CryptoKey);
			await expect(store.getIdentity(ada)).resolves.toBe(cached);

			// Nothing survives the tab.
			resetKeyStore();
			await expect((await keyStore()).getIdentity(ada)).resolves.toBeUndefined();
		} finally {
			globalThis.indexedDB = real;
		}
	});

	it('is used when no key of any kind survives a round trip', async () => {
		vi.spyOn(crypto.subtle, 'generateKey').mockRejectedValue(
			new DOMException('nope', 'NotSupportedError')
		);
		const store = await keyStore();
		expect(store.tier).toBe('memory');
		expect(store.fallbackReason).toContain('AES-GCM');
	});
});

describe('pins and sign-out', () => {
	it('reads back only the pins for one user', async () => {
		const store = await keyStore();
		await store.putPin(pin(ada, 'partnership-1'));
		await store.putPin(pin(ada, 'partnership-2'));
		await store.putPin(pin(bob, 'partnership-3'));

		await expect(store.getPins(ada)).resolves.toHaveLength(2);
		await expect(store.getPins(bob)).resolves.toHaveLength(1);
	});

	it('clears one user without touching another', async () => {
		const store = await keyStore();
		await store.putIdentity({ userId: ada, recipient, identity });
		await store.putIdentity({ userId: bob, recipient, identity });
		await store.putPin(pin(ada, 'partnership-1'));
		await store.putPin(pin(bob, 'partnership-3'));

		await store.clear(ada);

		await expect(store.getIdentity(ada)).resolves.toBeUndefined();
		await expect(store.getPins(ada)).resolves.toEqual([]);
		await expect(store.getIdentity(bob)).resolves.toMatchObject({ recipient });
		await expect(store.getPins(bob)).resolves.toHaveLength(1);
	});

	it('leaves the device key behind so another account still opens', async () => {
		breakX25519();
		const store = await keyStore();
		await store.putIdentity({ userId: ada, recipient, identity });
		await store.putIdentity({ userId: bob, recipient, identity });

		await store.clear(ada);

		resetKeyStore();
		const cold = await keyStore();
		await expect(cold.getIdentity(bob)).resolves.toMatchObject({ key: identity });
	});
});
