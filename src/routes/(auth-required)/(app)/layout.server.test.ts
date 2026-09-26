import { afterEach, beforeEach, expect, test } from 'vitest';
import type { Db } from '$lib/server/db';
import { grantFeature } from '$lib/server/features';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runLoad } from '$lib/testing/events';
import {
	createTestInvite,
	createTestPartnership,
	createTestUser,
	type TestUser
} from '$lib/testing/fixtures';
import { load } from './+layout.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada', image: '/ada.png' });
	jun = await createTestUser(db, { name: 'Jun' });
});

afterEach(() => harness.close());

test('gives the bottom nav one tab per linked partner', async () => {
	const { id } = await createTestPartnership(db, ada, jun, { partnerName: 'Jun' });
	const { partners } = await runLoad(load(fakeEvent({ db, user: ada })));
	expect(partners).toEqual([{ id, name: 'Jun', image: null }]);
});

test('uses the name and picture the viewer would recognise', async () => {
	await createTestPartnership(db, ada, jun, { yourName: 'Ada', partnerName: 'Jun' });
	const { partners } = await runLoad(load(fakeEvent({ db, user: jun })));
	expect(partners).toEqual([{ id: expect.any(String), name: 'Ada', image: '/ada.png' }]);
});

test('leaves a pending invite out of the nav', async () => {
	// A tab with nobody behind it would open an empty page and read as a bug.
	await createTestInvite(db, ada);
	const { partners } = await runLoad(load(fakeEvent({ db, user: ada })));
	expect(partners).toEqual([]);
});

test('degrades to an empty nav rather than throwing without a session', async () => {
	const { partners } = await runLoad(load(fakeEvent({ db, user: null })));
	expect(partners).toEqual([]);
});

test('lists the features the viewer holds, and only theirs', async () => {
	await grantFeature(db, { userId: ada.id, feature: 'guides', grantedByUserId: jun.id });
	expect((await runLoad(load(fakeEvent({ db, user: ada })))).features).toEqual(['guides']);
	expect((await runLoad(load(fakeEvent({ db, user: jun })))).features).toEqual([]);
});

test('says whether the viewer is an admin', async () => {
	const admin = await createTestUser(db, { role: 'admin' });
	expect((await runLoad(load(fakeEvent({ db, user: admin })))).isAdmin).toBe(true);
	expect((await runLoad(load(fakeEvent({ db, user: ada })))).isAdmin).toBe(false);
});

test('gives no features and no admin without a session', async () => {
	const data = await runLoad(load(fakeEvent({ db, user: null })));
	expect(data.features).toEqual([]);
	expect(data.isAdmin).toBe(false);
});
