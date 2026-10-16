import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestUser,
	grantTestDaydreams,
	type TestUser
} from '$lib/testing/fixtures';
import { POST } from './+server';

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

const read = (user: TestUser | null, id: string, json: unknown) =>
	runAndCatch(() => POST(fakeEvent({ db, user, params: { id }, json, method: 'POST' })));

describe('POST /api/daydreams/[id]/turns/read', () => {
	it('opens the turns asked for, sealed', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story', 'user']);
		const result = await read(ada, id, { ids: turnIds });
		if (result.type !== 'ok') {
			throw new Error(JSON.stringify(result));
		}
		const { turns } = (await result.value.json()) as { turns: { id: string }[] };
		expect(new Set(turns.map((turn) => turn.id))).toEqual(new Set(turnIds));
	});

	it('refuses a visitor, an account without the feature, and someone else’s daydream', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story']);
		const bo = await createTestUser(db, { name: 'Bo' });
		expect(await read(null, id, { ids: turnIds })).toMatchObject({ status: 401 });
		expect(await read(bo, id, { ids: turnIds })).toMatchObject({ status: 403 });
		expect(await read(jun, id, { ids: turnIds })).toMatchObject({ status: 404 });
	});

	it('refuses a malformed body, or too many ids at once', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await read(ada, id, { ids: [] })).toMatchObject({ status: 400 });
		expect(await read(ada, id, { ids: ['not-an-id'] })).toMatchObject({ status: 400 });
		const many = Array.from({ length: 101 }, () => crypto.randomUUID());
		expect(await read(ada, id, { ids: many })).toMatchObject({ status: 400 });
	});
});
