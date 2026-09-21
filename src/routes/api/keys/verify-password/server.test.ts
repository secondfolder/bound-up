import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APIError } from 'better-auth/api';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { account } from '$lib/server/db/schema';
import { POST } from './+server';

/**
 * The server half of the password prompt that guards adding a passkey.
 *
 * The browser has already opened the stored wrap with the password by the time
 * this is called, which proves it on the device. This exists because that is
 * not enough: a permission is enforced on the server (invariant 14), and the
 * new credential can sign in on its own afterwards.
 */

let harness: TestDb;
let ada: TestUser;

const SECRET = 'A'.repeat(43);

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

function post(json: unknown, changePassword = vi.fn().mockResolvedValue({})) {
	return {
		changePassword,
		response: POST(fakeEvent({ db: harness.db, user: ada, json, authApi: { changePassword } }))
	};
}

describe('POST /api/keys/verify-password', () => {
	it('refuses an unsigned visitor', async () => {
		const result = await runAndCatch(() =>
			POST(fakeEvent({ db: harness.db, json: { authSecret: SECRET } }))
		);
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});

	/**
	 * The field is the output of the client KDF, never a password. A short value
	 * means the browser did not run it, which is worth rejecting before it
	 * reaches Better Auth.
	 */
	it('rejects anything that is not a derived auth secret', async () => {
		const result = await runAndCatch(() => post({ authSecret: 'hunter2' }).response);
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	it('accepts the current password', async () => {
		await givePassword(ada.id);
		const { changePassword, response } = post({ authSecret: SECRET });

		await expect((await response).json()).resolves.toEqual({ verified: true, hasPassword: true });
		// A no-op change is the only way to ask Better Auth "is this the current
		// password?" — there is no verify endpoint. Same trick as ?/setup.
		expect(changePassword).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({ currentPassword: SECRET, newPassword: SECRET })
			})
		);
	});

	/** Never revokes anything: this is a check, and it must have no side effect. */
	it('leaves other sessions alone', async () => {
		await givePassword(ada.id);
		const { changePassword, response } = post({ authSecret: SECRET });
		await response;

		expect(changePassword.mock.calls[0][0].body.revokeOtherSessions).toBe(false);
	});

	it('reports a wrong password as a 403, not an error', async () => {
		await givePassword(ada.id);
		const { response } = post(
			{ authSecret: SECRET },
			vi
				.fn()
				.mockRejectedValue(
					new APIError('UNAUTHORIZED', { code: 'INVALID_PASSWORD', message: 'nope' })
				)
		);

		const result = await response;
		expect(result.status).toBe(403);
		await expect(result.json()).resolves.toEqual({ verified: false, hasPassword: true });
	});

	/**
	 * A passkey-only account has no password to prove, and asking for one would
	 * be asking for something that does not exist. The flow does not show the
	 * prompt in that case; this is the matching server-side answer.
	 */
	it('passes an account that has no password at all', async () => {
		const { changePassword, response } = post({ authSecret: SECRET });

		await expect((await response).json()).resolves.toEqual({ verified: true, hasPassword: false });
		expect(changePassword).not.toHaveBeenCalled();
	});

	it('turns an unexpected failure into a 500 rather than a false pass', async () => {
		await givePassword(ada.id);
		const { response } = post({ authSecret: SECRET }, vi.fn().mockRejectedValue(new Error('boom')));

		await expect(runAndCatch(() => response)).resolves.toMatchObject({
			type: 'error',
			status: 500
		});
	});
});
