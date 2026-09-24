import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { passkey } from '$lib/server/db/schema';
import { addPasskeyWrap, listWrapsForUser } from '$lib/server/keys';
import { FAKE_WRAP_BLOB } from '$lib/testing/crypto';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestUser, createTestUserKeys, type TestUser } from '$lib/testing/fixtures';
import { DELETE } from './+server';

/** Removing a passkey takes its wrap with it, unlike Better Auth's own delete. */

let harness: TestDb;
let ada: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	await createTestUserKeys(harness.db, ada);
	await harness.db.insert(passkey).values({
		id: 'pk-ada',
		name: 'Phone',
		publicKey: 'irrelevant',
		userId: ada.id,
		credentialID: 'cred-ada',
		counter: 0,
		deviceType: 'singleDevice',
		backedUp: false,
		transports: 'internal',
		createdAt: new Date()
	});
	await addPasskeyWrap(harness.db, ada.id, {
		passkeyId: 'pk-ada',
		wrap: {
			type: 'passkey-handle',
			params: {
				type: 'passkey-handle',
				version: 1,
				credentialId: 'cred-ada',
				rpId: 'bound-up.test'
			},
			blob: FAKE_WRAP_BLOB
		}
	});
});

afterEach(() => harness.close());

describe('DELETE /api/keys/passkey/[id]', () => {
	it('refuses an unsigned visitor', async () => {
		const result = await runAndCatch(() =>
			DELETE(fakeEvent({ db: harness.db, params: { id: 'pk-ada' } }))
		);
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});

	it('removes the passkey and its wrap, leaving the password wrap', async () => {
		const response = await DELETE(
			fakeEvent({ db: harness.db, user: ada, params: { id: 'pk-ada' } })
		);
		expect(response.status).toBe(200);

		await expect(
			harness.db.select().from(passkey).where(eq(passkey.id, 'pk-ada'))
		).resolves.toEqual([]);
		const wraps = await listWrapsForUser(harness.db, ada.id);
		expect(wraps.map((wrap) => wrap.type)).toEqual(['password']);
	});

	it('404s for someone else’s passkey', async () => {
		const jun = await createTestUser(harness.db, { name: 'Jun' });
		const result = await runAndCatch(() =>
			DELETE(fakeEvent({ db: harness.db, user: jun, params: { id: 'pk-ada' } }))
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});
