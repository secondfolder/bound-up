import { APIError } from 'better-auth/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentPasswordWrapParams } from '$lib/crypto/setup';
import { account } from '$lib/server/db/schema';
import { FAKE_WRAP_BLOB } from '$lib/testing/crypto';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestUser,
	createTestUserKeys,
	readWrapRows,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

let harness: TestDb;
let ada: TestUser;

const PARAMS = JSON.stringify(currentPasswordWrapParams());
const SECRET_A = 'A'.repeat(43);
const SECRET_B = 'B'.repeat(43);

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

function loadEvent(passkeys: Record<string, unknown>[] = []) {
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

	it('returns passkeys and the unlock bundle', async () => {
		await givePassword(ada.id);
		const keys = await createTestUserKeys(harness.db, ada);

		const data = await runLoad(load(loadEvent([{ id: 'pk-1', name: 'Laptop' }])));

		expect(data.bundle.recipient).toBe(keys.recipient);
		expect(data.passkeys).toMatchObject([{ id: 'pk-1', name: 'Laptop' }]);
	});

	/** Every account is created with keys; one without them is broken data. */
	it('refuses an account with no keys rather than rendering a half page', async () => {
		const result = await runAndCatch(() => load(loadEvent()));
		expect(result).toMatchObject({ type: 'error', status: 409 });
	});

	/**
	 * From the AAGUID on Better Auth's own `passkey` row — the app no longer
	 * keeps a copy of it (the `passkey_details` table went with the PRF
	 * verdicts it existed for).
	 */
	it('resolves the provider from the AAGUID Better Auth stored', async () => {
		await createTestUserKeys(harness.db, ada);
		const data = await runLoad(
			load(
				loadEvent([
					{ id: 'pk-1', aaguid: '531126d6-e717-415c-9320-3d9aa6981239' },
					// Apple zeroes it under the default attestation, which is not an
					// error and has to come back as "no provider".
					{ id: 'pk-2', aaguid: '00000000-0000-0000-0000-000000000000' }
				])
			)
		);

		expect(data.passkeys[0].provider).toEqual({ name: 'Dashlane' });
		expect(data.passkeys[1].provider).toBeNull();
	});
});

describe('changePassword', () => {
	async function setUpAda() {
		await givePassword(ada.id);
		return createTestUserKeys(harness.db, ada);
	}

	it('inserts the new wrap, changes the credential, then retires the old', async () => {
		await setUpAda();
		const seen: number[] = [];
		const changePassword = vi.fn().mockImplementation(async () => {
			seen.push((await readWrapRows(harness.db, ada.id)).length);
			return {};
		});

		const result = await actions.changePassword(
			fakeEvent({
				db: harness.db,
				user: ada,
				authApi: { changePassword },
				formData: {
					currentAuthSecret: SECRET_A,
					newAuthSecret: SECRET_B,
					wrapParams: PARAMS,
					wrapBlob: 'bmV3LXdyYXAtYmxvYi10aGF0LWlzLWxvbmctZW5vdWdo'
				}
			})
		);

		expect(result).toMatchObject({ form: { valid: true } });
		expect(seen).toEqual([2]);
		const remaining = await readWrapRows(harness.db, ada.id);
		expect(remaining).toHaveLength(1);
		expect(remaining[0].blob).toBe('bmV3LXdyYXAtYmxvYi10aGF0LWlzLWxvbmctZW5vdWdo');
	});

	it('rolls the new wrap back when the credential change fails', async () => {
		await setUpAda();
		const changePassword = vi
			.fn()
			.mockRejectedValue(
				new APIError('BAD_REQUEST', { code: 'INVALID_PASSWORD', message: 'Invalid password' })
			);

		const result = await actions.changePassword(
			fakeEvent({
				db: harness.db,
				user: ada,
				authApi: { changePassword },
				formData: {
					currentAuthSecret: SECRET_A,
					newAuthSecret: SECRET_B,
					wrapParams: PARAMS,
					wrapBlob: 'bmV3LXdyYXAtYmxvYi10aGF0LWlzLWxvbmctZW5vdWdo'
				}
			})
		);

		expect(JSON.stringify(result)).toContain('not right');
		const remaining = await readWrapRows(harness.db, ada.id);
		expect(remaining).toHaveLength(1);
		expect(remaining[0].blob).toBe(FAKE_WRAP_BLOB);
	});

	it('does not revoke other sessions', async () => {
		await setUpAda();
		const changePassword = vi.fn().mockResolvedValue({});

		await actions.changePassword(
			fakeEvent({
				db: harness.db,
				user: ada,
				authApi: { changePassword },
				formData: {
					currentAuthSecret: SECRET_A,
					newAuthSecret: SECRET_B,
					wrapParams: PARAMS,
					wrapBlob: 'bmV3LXdyYXAtYmxvYi10aGF0LWlzLWxvbmctZW5vdWdo'
				}
			})
		);

		expect(changePassword.mock.calls[0][0].body.revokeOtherSessions).toBe(false);
	});

	/**
	 * Every account has keys, so a change without a re-sealed wrap would leave
	 * the key sealed to a password that no longer exists.
	 */
	it('refuses a change that carries no re-sealed wrap', async () => {
		await setUpAda();
		const changePassword = vi.fn().mockResolvedValue({});

		const result = await actions.changePassword(
			fakeEvent({
				db: harness.db,
				user: ada,
				authApi: { changePassword },
				formData: {
					currentAuthSecret: SECRET_A,
					newAuthSecret: SECRET_B
				}
			})
		);

		expect(result).toMatchObject({ status: 400 });
		expect(changePassword).not.toHaveBeenCalled();
	});
});
