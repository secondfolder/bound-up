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
import { GET } from './+server';

/** The user's own daydreams, sealed, for naming a new one; nobody else's. */

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
	for (const user of [ada, jun]) {
		await grantTestDaydreams(db, user.id);
	}
});

afterEach(() => harness.close());

const list = (user: TestUser | null) => runAndCatch(() => GET(fakeEvent({ db, user })));

describe('GET /api/daydreams', () => {
	it('answers the user’s own daydreams, setups sealed, and no one else’s', async () => {
		const first = await createTestDaydream(db, ada.id);
		const second = await createTestDaydream(db, ada.id);
		await createTestDaydream(db, jun.id);
		const result = await list(ada);
		if (result.type !== 'ok') {
			throw new Error(`expected the list, got ${JSON.stringify(result)}`);
		}
		const { daydreams } = (await result.value.json()) as {
			daydreams: { id: string; setup: { recordId: string; ciphertext: string } }[];
		};
		expect(new Set(daydreams.map((daydream) => daydream.id))).toEqual(
			new Set([first.id, second.id])
		);
		expect(daydreams[0]?.setup.recordId).toBe(daydreams[0]?.id);
		expect(daydreams[0]?.setup.ciphertext).toBeTruthy();
	});

	it('refuses an account without daydreams, and someone signed out', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		expect(await list(bo)).toMatchObject({ type: 'error', status: 403 });
		expect(await list(null)).toMatchObject({ type: 'error', status: 401 });
	});
});
