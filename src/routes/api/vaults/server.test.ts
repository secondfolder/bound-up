import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestUser, createTestUserKeys, type TestUser } from '$lib/testing/fixtures';
import { GET, POST } from './+server';

/**
 * The vault endpoints' answers. What may be written is `server/vaults.ts`'s
 * job and is tested there; this is the mapping from its results to statuses,
 * which the browser relies on — 409 in particular is how a device learns it
 * lost a race rather than failed.
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

const selfVault = (id: string) => ({
	kind: 'self',
	id,
	keyCheck: 'A'.repeat(43),
	wraps: [{ userId: ada.id, ciphertext: 'd3JhcA==', forRecipient: adaKey }]
});

const post = (json: unknown, user: TestUser | null = ada) =>
	runAndCatch(() => POST(fakeEvent({ db: harness.db, user, json })));

describe('/api/vaults', () => {
	it('refuses an unsigned visitor', async () => {
		expect(await runAndCatch(() => GET(fakeEvent({ db: harness.db })))).toMatchObject({
			type: 'error',
			status: 401
		});
		expect(await post(selfVault('00000000-0000-4000-8000-000000000001'), null)).toMatchObject({
			status: 401
		});
	});

	it('creates, then answers a second vault for the same scope with 409', async () => {
		const created = await post(selfVault('00000000-0000-4000-8000-000000000001'));
		expect(created.type === 'ok' && created.value.status).toBe(201);
		expect(await post(selfVault('00000000-0000-4000-8000-000000000002'))).toMatchObject({
			type: 'error',
			status: 409
		});
	});

	it('rejects an id the browser did not make, and a wrap for the wrong key', async () => {
		expect(await post(selfVault('not-a-uuid'))).toMatchObject({ status: 400 });
		expect(
			await post({ ...selfVault('00000000-0000-4000-8000-000000000001'), wraps: [] })
		).toMatchObject({ status: 400 });
	});

	it('lists what the user holds', async () => {
		await post(selfVault('00000000-0000-4000-8000-000000000001'));
		const response = (await GET(fakeEvent({ db: harness.db, user: ada }))) as Response;
		expect(await response.json()).toMatchObject({
			recipient: adaKey,
			self: { id: '00000000-0000-4000-8000-000000000001' }
		});
	});
});
