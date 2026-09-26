import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { load as loadLayout } from './+layout.server';
import { load } from './+page.server';

let harness: TestDb;
let db: Db;
let admin: TestUser;
let ada: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	admin = await createTestUser(db, { name: 'Admin', email: 'admin@example.test', role: 'admin' });
	ada = await createTestUser(db, { name: 'Ada Lovelace', email: 'ada@example.test' });
});

afterEach(() => harness.close());

const search = (q?: string) =>
	runLoad(load(fakeEvent({ db, user: admin, path: q === undefined ? '/admin' : `/admin?q=${q}` })));

describe('access', () => {
	it.each([
		['an ordinary user', () => ada],
		['nobody', () => null]
	])('is a 404 for %s, from the layout and from the page', async (_, who) => {
		const user = who();
		expect(await runAndCatch(() => loadLayout(fakeEvent({ db, user })))).toMatchObject({
			type: 'error',
			status: 404
		});
		expect(await runAndCatch(() => load(fakeEvent({ db, user, path: '/admin' })))).toMatchObject({
			type: 'error',
			status: 404
		});
	});
});

describe('search', () => {
	it('matches email or name, ignoring case', async () => {
		expect((await search('ADA@')).users).toEqual([
			expect.objectContaining({ email: 'ada@example.test' })
		]);
		expect((await search('lovelace')).users).toEqual([
			expect.objectContaining({ email: 'ada@example.test' })
		]);
	});

	it('treats wildcard characters as themselves', async () => {
		expect((await search('%25')).users).toEqual([]);
		expect((await search('_')).users).toEqual([]);
	});

	it('lists the newest accounts when there is no query, marking admins', async () => {
		const data = await search();
		expect(data.query).toBe('');
		expect(data.users).toEqual([
			{ id: ada.id, name: 'Ada Lovelace', email: 'ada@example.test', isAdmin: false },
			{ id: admin.id, name: 'Admin', email: 'admin@example.test', isAdmin: true }
		]);
	});
});
