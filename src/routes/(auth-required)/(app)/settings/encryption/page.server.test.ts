import { APIError } from 'better-auth/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentPasswordWrapParams } from '$lib/crypto/setup';
import { account } from '$lib/server/db/schema';
import { listRestoreRequests } from '$lib/server/messaging';
import { FAKE_WRAP_BLOB, JUN_RECIPIENT } from '$lib/testing/crypto';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestUser,
	createTestUserKeys,
	readUserKeysRow,
	readWrapRows,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

let harness: TestDb;
let ada: TestUser;

const PARAMS = JSON.stringify(currentPasswordWrapParams());
const SECRET_A = 'A'.repeat(43);

/** Gives a user a password credential, as Better Auth would. */
async function givePassword(userId: string) {
	await harness.db.insert(account).values({
		id: `acct-${userId}`,
		accountId: userId,
		providerId: 'credential',
		userId,
		password: 'deadbeef:cafebabe',
		createdAt: new Date(),
		updatedAt: new Date()
	});
}

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
});

afterEach(() => harness.close());

/** The load lists passkeys, so it needs a Better Auth api even to say "none". */
function loadEvent(passkeys: { id: string; name: string | null }[] = []) {
	return fakeEvent({
		db: harness.db,
		user: ada,
		authApi: { listPasskeys: vi.fn().mockResolvedValue(passkeys) }
	});
}

describe('load', () => {
	it('refuses an unsigned visitor', async () => {
		const result = await runAndCatch(() => load(fakeEvent({ db: harness.db })));
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});

	it('reports no keys and no password on a bare account', async () => {
		const data = await runLoad(load(loadEvent()));
		expect(data.hasPassword).toBe(false);
		expect(data.bundle).toMatchObject({ recipient: null, wraps: [] });
	});

	it('reports the recipient and wraps once set up', async () => {
		await givePassword(ada.id);
		const keys = await createTestUserKeys(harness.db, ada);
		const data = await runLoad(load(loadEvent()));
		expect(data.hasPassword).toBe(true);
		expect(data.bundle.recipient).toBe(keys.recipient);
		expect(data.bundle.wraps).toHaveLength(1);
	});

	/**
	 * So a wrap can be listed under the passkey's *current* name rather than the
	 * label frozen into it when it was sealed — renaming a passkey in Security
	 * would otherwise leave two names for one thing.
	 */
	it('maps passkey ids to their names, skipping unnamed ones', async () => {
		const data = await runLoad(
			load(
				loadEvent([
					{ id: 'pk-1', name: 'Laptop' },
					{ id: 'pk-2', name: null }
				])
			)
		);
		expect(data.passkeyNames).toEqual({ 'pk-1': 'Laptop' });
	});
});

describe('setup', () => {
	it('sets a first password and stores the keys', async () => {
		const setPassword = vi.fn().mockResolvedValue({ status: true });
		const result = await actions.setup(
			fakeEvent({
				db: harness.db,
				user: ada,
				authApi: { setPassword },
				formData: {
					authSecret: SECRET_A,
					recipient: JUN_RECIPIENT,
					wrapParams: PARAMS,
					wrapBlob: FAKE_WRAP_BLOB
				}
			})
		);

		expect(result).toMatchObject({ form: { valid: true } });
		expect(setPassword).toHaveBeenCalledOnce();
		const row = await readUserKeysRow(harness.db, ada.id);
		expect(row.recipient).toBe(JUN_RECIPIENT);
		await expect(readWrapRows(harness.db, ada.id)).resolves.toHaveLength(1);
	});

	/**
	 * Sealing to a password the account does not actually have would produce a
	 * key that looks fine and can never be opened, so the existing password is
	 * verified before anything is written.
	 */
	it('verifies an existing password rather than trusting it', async () => {
		await givePassword(ada.id);
		const changePassword = vi
			.fn()
			.mockRejectedValue(
				new APIError('BAD_REQUEST', { code: 'INVALID_PASSWORD', message: 'Invalid password' })
			);

		const result = await actions.setup(
			fakeEvent({
				db: harness.db,
				user: ada,
				authApi: { changePassword },
				formData: {
					authSecret: SECRET_A,
					recipient: JUN_RECIPIENT,
					wrapParams: PARAMS,
					wrapBlob: FAKE_WRAP_BLOB
				}
			})
		);

		expect(JSON.stringify(result)).toContain('not your current password');
		// Nothing written on a bad password.
		await expect(readUserKeysRow(harness.db, ada.id)).resolves.toBeUndefined();
	});

	it('rejects malformed key material', async () => {
		const result = await actions.setup(
			fakeEvent({
				db: harness.db,
				user: ada,
				authApi: { setPassword: vi.fn() },
				formData: {
					authSecret: SECRET_A,
					recipient: 'not-an-age-recipient',
					wrapParams: PARAMS,
					wrapBlob: FAKE_WRAP_BLOB
				}
			})
		);
		expect(result).toMatchObject({ status: 400 });
		await expect(readUserKeysRow(harness.db, ada.id)).resolves.toBeUndefined();
	});

	/**
	 * Replacing an identity abandons everything encrypted to the old one, so
	 * each accepted partnership gets a restore request — that is the only route
	 * back to the history.
	 */
	it('asks every partner to restore the history when replacing an identity', async () => {
		await givePassword(ada.id);
		await createTestUserKeys(harness.db, ada);
		const jun = await createTestUser(harness.db, { name: 'Jun' });
		const partnership = await createTestPartnership(harness.db, ada, jun);

		await actions.setup(
			fakeEvent({
				db: harness.db,
				user: ada,
				authApi: { changePassword: vi.fn().mockResolvedValue({}) },
				formData: {
					authSecret: SECRET_A,
					recipient: JUN_RECIPIENT,
					wrapParams: PARAMS,
					wrapBlob: FAKE_WRAP_BLOB
				}
			})
		);

		const row = await readUserKeysRow(harness.db, ada.id);
		expect(row.recipient).toBe(JUN_RECIPIENT);
		// Exactly one wrap, and the acknowledgement is owed again.
		await expect(readWrapRows(harness.db, ada.id)).resolves.toHaveLength(1);
		expect(row.historyWarningAckAt).toBeNull();

		const requests = await listRestoreRequests(harness.db, partnership.id, jun.id);
		expect(requests).toHaveLength(1);
		expect(requests[0].requestedRecipient).toBe(JUN_RECIPIENT);
		expect(requests[0].mine).toBe(false);
	});
});

describe('revokeWrap', () => {
	/**
	 * A recipient with no wraps is an identity nobody can ever open again, and
	 * the tempting recovery from it — generate a fresh key — silently orphans
	 * every message the user has received. So the last one cannot be removed.
	 */
	it('refuses to remove the only way in', async () => {
		await createTestUserKeys(harness.db, ada);
		const [wrap] = await readWrapRows(harness.db, ada.id);

		const result = await actions.revokeWrap(
			fakeEvent({ db: harness.db, user: ada, formData: { wrapId: wrap.id } })
		);
		expect(result).toMatchObject({ status: 400 });
		await expect(readWrapRows(harness.db, ada.id)).resolves.toHaveLength(1);
	});

	it('removes one when another remains', async () => {
		await createTestUserKeys(harness.db, ada);
		const { addWrap } = await import('$lib/server/keys');
		await addWrap(harness.db, ada.id, {
			type: 'webauthn-prf',
			params: { type: 'webauthn-prf', version: 1, rpId: 'bound-up.test' },
			blob: FAKE_WRAP_BLOB,
			label: 'iPhone'
		});
		const wraps = await readWrapRows(harness.db, ada.id);
		const passwordWrap = defined(
			wraps.find((w) => w.type === 'password'),
			'the password wrap'
		);

		await actions.revokeWrap(
			fakeEvent({ db: harness.db, user: ada, formData: { wrapId: passwordWrap.id } })
		);
		const remaining = await readWrapRows(harness.db, ada.id);
		expect(remaining).toHaveLength(1);
		expect(remaining[0].type).toBe('webauthn-prf');
	});

	it('will not remove someone else’s wrap', async () => {
		await createTestUserKeys(harness.db, ada);
		const jun = await createTestUser(harness.db, { name: 'Jun' });
		await createTestUserKeys(harness.db, jun);
		const { addWrap } = await import('$lib/server/keys');
		await addWrap(harness.db, ada.id, {
			type: 'password',
			params: currentPasswordWrapParams(),
			blob: FAKE_WRAP_BLOB
		});
		const [junWrap] = await readWrapRows(harness.db, jun.id);

		const result = await actions.revokeWrap(
			fakeEvent({ db: harness.db, user: ada, formData: { wrapId: junWrap.id } })
		);
		expect(result).toMatchObject({ status: 404 });
		await expect(readWrapRows(harness.db, jun.id)).resolves.toHaveLength(1);
	});
});

describe('forgetPassword', () => {
	it('clears the stored credential so a new one can be set', async () => {
		await givePassword(ada.id);
		const { hasPasswordCredential } = await import('$lib/server/credentials');
		await expect(hasPasswordCredential(harness.db, ada.id)).resolves.toBe(true);

		await actions.forgetPassword(fakeEvent({ db: harness.db, user: ada }));
		await expect(hasPasswordCredential(harness.db, ada.id)).resolves.toBe(false);
	});

	it('refuses an unsigned visitor', async () => {
		const result = await runAndCatch(() => actions.forgetPassword(fakeEvent({ db: harness.db })));
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});
});

describe('addWrap', () => {
	const PasskeyParams = JSON.stringify({
		type: 'webauthn-prf',
		version: 1,
		rpId: 'bound-up.test'
	});

	it('stores a passkey as another way in', async () => {
		await createTestUserKeys(harness.db, ada);

		await actions.addWrap(
			fakeEvent({
				db: harness.db,
				user: ada,
				formData: { wrapParams: PasskeyParams, wrapBlob: FAKE_WRAP_BLOB, label: 'iPhone' }
			})
		);

		const wraps = await readWrapRows(harness.db, ada.id);
		expect(wraps).toHaveLength(2);
		const added = defined(
			wraps.find((wrap) => wrap.type === 'webauthn-prf'),
			'the passkey wrap'
		);
		expect(added.label).toBe('iPhone');
		// Stored verbatim and never read: the server has no key to check it with.
		expect(added.blob).toBe(FAKE_WRAP_BLOB);
		expect(added.params).toMatchObject({ rpId: 'bound-up.test' });
	});

	it('refuses a blob that is not the shape a wrap has', async () => {
		await createTestUserKeys(harness.db, ada);

		const result = await actions.addWrap(
			fakeEvent({
				db: harness.db,
				user: ada,
				formData: { wrapParams: PasskeyParams, wrapBlob: 'not a wrap!' }
			})
		);
		expect(result).toMatchObject({ status: 400 });
		await expect(readWrapRows(harness.db, ada.id)).resolves.toHaveLength(1);
	});

	it('refuses params naming an unlock method this version has never heard of', async () => {
		await createTestUserKeys(harness.db, ada);

		const result = await actions.addWrap(
			fakeEvent({
				db: harness.db,
				user: ada,
				formData: {
					wrapParams: JSON.stringify({ type: 'telepathy', version: 1 }),
					wrapBlob: FAKE_WRAP_BLOB
				}
			})
		);
		expect(result).toMatchObject({ status: 400 });
	});

	it('refuses to add a way into an account that has no identity', async () => {
		const result = await actions.addWrap(
			fakeEvent({
				db: harness.db,
				user: ada,
				formData: { wrapParams: PasskeyParams, wrapBlob: FAKE_WRAP_BLOB }
			})
		);
		// Otherwise the list of ways to unlock would name one that opens nothing.
		expect(result).toMatchObject({ status: 400 });
		await expect(readWrapRows(harness.db, ada.id)).resolves.toHaveLength(0);
	});

	it('refuses an unsigned visitor', async () => {
		const result = await runAndCatch(() => actions.addWrap(fakeEvent({ db: harness.db })));
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});
});
