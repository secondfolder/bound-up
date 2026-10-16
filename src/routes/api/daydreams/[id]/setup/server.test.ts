import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestUser,
	ensureTestSelfVault,
	fakeSealed,
	grantTestDaydreams,
	readDaydreamRow,
	type TestUser
} from '$lib/testing/fixtures';
import { PUT } from './+server';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
	await grantTestDaydreams(db, ada.id);
	await grantTestDaydreams(db, jun.id);
});

afterEach(() => harness.close());

async function setup(user: TestUser, expectedRevision = 0) {
	return {
		vaultId: await ensureTestSelfVault(db, user.id),
		ciphertext: fakeSealed('setup'),
		payloadVersion: 2,
		expectedRevision
	};
}

const save = (user: TestUser | null, id: string, json: unknown) =>
	runAndCatch(() => PUT(fakeEvent({ db, user, params: { id }, json, method: 'PUT' })));

describe('PUT /api/daydreams/[id]/setup', () => {
	it('replaces the setup at the revision it was opened at', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const body = await setup(ada);
		const result = await save(ada, id, body);
		if (result.type !== 'ok') {
			throw new Error(JSON.stringify(result));
		}
		expect(await result.value.json()).toEqual({ revision: 1 });
		expect(await readDaydreamRow(db, id)).toMatchObject({
			ciphertext: body.ciphertext,
			revision: 1
		});
	});

	it('refuses a stale revision', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		await save(ada, id, await setup(ada));
		expect(await save(ada, id, await setup(ada))).toMatchObject({ status: 409 });
	});

	it('refuses a visitor, an account without the feature, someone else, and a malformed body', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const bo = await createTestUser(db, { name: 'Bo' });
		expect(await save(null, id, await setup(ada))).toMatchObject({ status: 401 });
		expect(await save(bo, id, await setup(bo))).toMatchObject({ status: 403 });
		expect(await save(jun, id, await setup(jun))).toMatchObject({ status: 404 });
		expect(await save(ada, id, { ...(await setup(ada)), ciphertext: 'plain' })).toMatchObject({
			status: 400
		});
	});
});
