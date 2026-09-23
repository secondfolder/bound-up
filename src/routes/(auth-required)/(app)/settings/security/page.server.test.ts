import { APIError } from 'better-auth/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentPasswordWrapParams } from '$lib/crypto/setup';
import { account, passkey } from '$lib/server/db/schema';
import { recordPasskeyPrfStatus } from '$lib/server/keys';
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

/** A real `passkey` row, which is what the PRF verdict's foreign key needs. */
async function givePasskeyRow(id: string) {
	await harness.db.insert(passkey).values({
		id,
		name: id,
		publicKey: 'irrelevant',
		userId: ada.id,
		credentialID: `cred-${id}`,
		counter: 0,
		deviceType: 'singleDevice',
		backedUp: false,
		transports: 'internal',
		createdAt: new Date()
	});
}

describe('load', () => {
	it('refuses an unsigned visitor', async () => {
		const result = await runAndCatch(() => load(fakeEvent({ db: harness.db })));
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});

	it('returns passkeys, password state, and the unlock bundle', async () => {
		await givePassword(ada.id);
		const keys = await createTestUserKeys(harness.db, ada);

		const data = await runLoad(load(loadEvent([{ id: 'pk-1', name: 'Laptop' }])));

		expect(data.hasPassword).toBe(true);
		expect(data.bundle.recipient).toBe(keys.recipient);
		expect(data.passkeys).toMatchObject([{ id: 'pk-1', name: 'Laptop' }]);
	});

	/**
	 * Three states, and the third is the one that is easy to get wrong: a passkey
	 * nothing has ever tried is not a passkey that failed. Every passkey
	 * registered before this check existed is in that state, and flagging them
	 * would put a warning on every account that had one.
	 */
	it('reports a verdict only for a passkey that has actually been tried', async () => {
		await givePasskeyRow('pk-good');
		await givePasskeyRow('pk-bad');
		await givePasskeyRow('pk-untried');
		await recordPasskeyPrfStatus(harness.db, ada.id, {
			passkeyId: 'pk-good',
			prfStatus: 'supported'
		});
		await recordPasskeyPrfStatus(harness.db, ada.id, {
			passkeyId: 'pk-bad',
			prfStatus: 'unsupported'
		});

		const data = await runLoad(
			load(loadEvent([{ id: 'pk-good' }, { id: 'pk-bad' }, { id: 'pk-untried' }]))
		);

		expect(data.passkeys.map((entry: { prfStatus?: string }) => entry.prfStatus)).toEqual([
			'supported',
			'unsupported',
			undefined
		]);
	});

	/** So the warning can name the manager rather than leaving the user to guess. */
	it('resolves the provider from the AAGUID Better Auth stored', async () => {
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

		expect(data.passkeys[0].provider).toMatchObject({ name: 'Dashlane', prf: 'none' });
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

	it('still changes a password on an account with no message keys', async () => {
		await givePassword(ada.id);
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

		expect(result).toMatchObject({ form: { valid: true } });
		await expect(readWrapRows(harness.db, ada.id)).resolves.toHaveLength(0);
		expect(changePassword).toHaveBeenCalledOnce();
	});
});
