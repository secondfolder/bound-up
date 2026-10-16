import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestUser,
	ensureTestSelfVault,
	fakeSealed,
	grantTestDaydreams,
	type TestUser
} from '$lib/testing/fixtures';
import { DELETE, POST } from './+server';

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

async function mark(user: TestUser, turnId: string) {
	return {
		id: crypto.randomUUID(),
		turnId,
		vaultId: await ensureTestSelfVault(db, user.id),
		ciphertext: fakeSealed('mark'),
		payloadVersion: 1
	};
}

const create = (user: TestUser | null, id: string, json: unknown) =>
	runAndCatch(() => POST(fakeEvent({ db, user, params: { id }, json, method: 'POST' })));
const remove = (user: TestUser | null, id: string, markId: string) =>
	runAndCatch(() =>
		DELETE(
			fakeEvent({
				db,
				user,
				params: { id },
				path: `/api/daydreams/${id}/marks?id=${markId}`
			})
		)
	);

describe('/api/daydreams/[id]/marks', () => {
	it('adds a mark to a turn, and removes it', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story']);
		const body = await mark(ada, defined(turnIds[0], 'turn'));
		expect(await create(ada, id, body)).toMatchObject({ type: 'ok' });
		expect(await db.query.daydreamMarks.findMany()).toHaveLength(1);
		expect(await remove(ada, id, body.id)).toMatchObject({ type: 'ok' });
		expect(await db.query.daydreamMarks.findMany()).toEqual([]);
		expect(await remove(ada, id, body.id)).toMatchObject({ status: 404 });
	});

	it('refuses a turn that is not in the daydream', async () => {
		const { id } = await createTestDaydream(db, ada.id, ['story']);
		expect(await create(ada, id, await mark(ada, crypto.randomUUID()))).toMatchObject({
			status: 409
		});
	});

	it('refuses a visitor, an account without the feature, someone else, and a malformed body', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story']);
		const turnId = defined(turnIds[0], 'turn');
		const bo = await createTestUser(db, { name: 'Bo' });
		expect(await create(null, id, await mark(ada, turnId))).toMatchObject({ status: 401 });
		expect(await create(bo, id, await mark(bo, turnId))).toMatchObject({ status: 403 });
		expect(await create(jun, id, await mark(jun, turnId))).toMatchObject({ status: 404 });
		expect(await create(ada, id, { turnId })).toMatchObject({ status: 400 });
		expect(await remove(ada, id, 'nope')).toMatchObject({ status: 400 });
	});
});
