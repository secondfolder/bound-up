import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { soloSpaceFor } from '$lib/server/spaces';
import { createVault } from '$lib/server/vaults';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestUser, createTestUserKeys, type TestUser } from '$lib/testing/fixtures';
import { GET } from './+server';

/**
 * The user-wide vault listing. Everything that writes a vault is under
 * `/api/spaces/[spaceId]/vault` and is tested there.
 */

let harness: TestDb;
let ada: TestUser;
let adaKey: string;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db);
	adaKey = (await createTestUserKeys(harness.db, ada)).recipient;
});

afterEach(() => harness.close());

describe('/api/vaults', () => {
	it('refuses an unsigned visitor', async () => {
		expect(await runAndCatch(() => GET(fakeEvent({ db: harness.db })))).toMatchObject({
			type: 'error',
			status: 401
		});
	});

	it('lists what the user holds, with the solo space their own vault is in', async () => {
		const soloSpaceId = defined(await soloSpaceFor(harness.db, ada.id), 'solo space');
		await createVault(harness.db, ada.id, soloSpaceId, {
			id: '00000000-0000-4000-8000-000000000001',
			keyCheck: 'A'.repeat(43),
			wraps: [{ userId: ada.id, ciphertext: 'd3JhcA==', forRecipient: adaKey }]
		});
		const response = (await GET(fakeEvent({ db: harness.db, user: ada }))) as Response;
		expect(await response.json()).toMatchObject({
			recipient: adaKey,
			soloSpaceId,
			self: { id: '00000000-0000-4000-8000-000000000001' }
		});
	});
});
