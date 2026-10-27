import { afterEach, beforeEach, expect, test } from 'vitest';
import { DEBUG_COOKIE, DEBUG_COOKIE_ON } from '$lib/debug';
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

test('gives the bottom nav one tab per linked partner, its names sealed', async () => {
	const { id } = await createTestPartnership(db, ada, jun);
	const { partners } = await runLoad(load(fakeEvent({ db, user: ada, cookies: {} })));
	expect(partners).toEqual([
		{ id, names: expect.objectContaining({ partnershipId: id, role: 'inviter' }), image: null }
	]);
	// The server hands over only ciphertext: it has no name to give.
	expect(partners[0]?.names.invite?.ciphertext).toMatch(/^sb1\./);
});

test('uses the names source and picture from the viewer’s own end', async () => {
	await createTestPartnership(db, ada, jun);
	const { partners } = await runLoad(load(fakeEvent({ db, user: jun, cookies: {} })));
	expect(partners).toEqual([
		{
			id: expect.any(String),
			names: expect.objectContaining({
				role: 'invitee',
				// The invitee is never handed the inviter's wrap of the invite key.
				invite: expect.objectContaining({ keyWrap: null })
			}),
			image: '/ada.png'
		}
	]);
});

test('leaves a pending invite out of the nav', async () => {
	// A tab with nobody behind it would open an empty page and read as a bug.
	await createTestInvite(db, ada);
	const { partners } = await runLoad(load(fakeEvent({ db, user: ada, cookies: {} })));
	expect(partners).toEqual([]);
});

test('degrades to an empty nav rather than throwing without a session', async () => {
	const { partners } = await runLoad(load(fakeEvent({ db, user: null, cookies: {} })));
	expect(partners).toEqual([]);
});

test('lists the features the viewer holds, and only theirs', async () => {
	await grantFeature(db, { userId: ada.id, feature: 'guides', grantedByUserId: jun.id });
	expect((await runLoad(load(fakeEvent({ db, user: ada, cookies: {} })))).features).toEqual([
		'guides'
	]);
	expect((await runLoad(load(fakeEvent({ db, user: jun, cookies: {} })))).features).toEqual([]);
});

test('says whether the viewer is an admin', async () => {
	const admin = await createTestUser(db, { role: 'admin' });
	expect((await runLoad(load(fakeEvent({ db, user: admin, cookies: {} })))).isAdmin).toBe(true);
	expect((await runLoad(load(fakeEvent({ db, user: ada, cookies: {} })))).isAdmin).toBe(false);
});

test('gives no features and no admin without a session', async () => {
	const data = await runLoad(load(fakeEvent({ db, user: null, cookies: {} })));
	expect(data.features).toEqual([]);
	expect(data.isAdmin).toBe(false);
});

test('turns debug mode on only for an account holding it, on a device that switched it on', async () => {
	const on = () => ({ [DEBUG_COOKIE]: DEBUG_COOKIE_ON });
	const debugFor = async (user: TestUser, cookies: Record<string, string>) =>
		(await runLoad(load(fakeEvent({ db, user, cookies })))).debug;

	expect(await debugFor(ada, on())).toBe(false);
	await grantFeature(db, { userId: ada.id, feature: 'debugMode', grantedByUserId: jun.id });
	expect(await debugFor(ada, {})).toBe(false);
	expect(await debugFor(ada, on())).toBe(true);
	// A partner gets nothing from the other side's grant.
	expect(await debugFor(jun, on())).toBe(false);
});

test('has debug mode off without a session', async () => {
	expect((await runLoad(load(fakeEvent({ db, user: null, cookies: {} })))).debug).toBe(false);
});

test('offers the switcher the viewer’s own space and each linked partnership, with the context', async () => {
	const { id } = await createTestPartnership(db, ada, jun);
	await createTestInvite(db, ada);
	const data = await runLoad(load(fakeEvent({ db, user: ada, cookies: {}, contextCookie: id })));
	expect(data.contextSpaces).toEqual([
		{ id: expect.any(String), kind: 'solo', colour: 'me', names: null },
		{
			id,
			kind: 'shared',
			colour: 'teal',
			names: expect.objectContaining({ partnershipId: id })
		}
	]);
	expect(data.context).toEqual({ kind: 'space', spaceId: id });
});

test('says Everyone for a context the viewer cannot use', async () => {
	const { id } = await createTestPartnership(db, ada, jun);
	const stranger = await createTestUser(db, { name: 'Cy' });
	const data = await runLoad(
		load(fakeEvent({ db, user: stranger, cookies: {}, contextCookie: id }))
	);
	expect(data.context).toEqual({ kind: 'all' });
});
