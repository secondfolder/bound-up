import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestUser,
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

const move = (user: TestUser | null, id: string, json: unknown) =>
	runAndCatch(() => PUT(fakeEvent({ db, user, params: { id }, json, method: 'PUT' })));

describe('PUT /api/daydreams/[id]/active', () => {
	it('moves the user to another turn', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story', 'user']);
		const opening = defined(turnIds[0], 'opening');
		expect(await move(ada, id, { turnId: opening })).toMatchObject({ type: 'ok' });
		expect(await readDaydreamRow(db, id)).toMatchObject({ activeTurnId: opening });
	});

	it('refuses a turn that is not in the daydream', async () => {
		const { id } = await createTestDaydream(db, ada.id, ['story']);
		expect(await move(ada, id, { turnId: crypto.randomUUID() })).toMatchObject({ status: 409 });
	});

	it('refuses a visitor, an account without the feature, someone else, and a malformed body', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story']);
		const turnId = defined(turnIds[0], 'turn');
		const bo = await createTestUser(db, { name: 'Bo' });
		expect(await move(null, id, { turnId })).toMatchObject({ status: 401 });
		expect(await move(bo, id, { turnId })).toMatchObject({ status: 403 });
		expect(await move(jun, id, { turnId })).toMatchObject({ status: 404 });
		expect(await move(ada, id, { turnId: 'nope' })).toMatchObject({ status: 400 });
	});
});
