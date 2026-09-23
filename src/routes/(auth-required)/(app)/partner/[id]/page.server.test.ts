import { afterEach, beforeEach, expect, test } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestInvite,
	createTestPartnership,
	createTestPartnershipReward,
	createTestPartnershipTask,
	createTestThread,
	createTestUser,
	setTestPartnershipRewardCredits,
	type TestUser
} from '$lib/testing/fixtures';
import { load } from './+page.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;
let stranger: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada', image: '/ada.png', timezone: 'Europe/London' });
	jun = await createTestUser(db, { name: 'Jun', timezone: 'America/New_York' });
	stranger = await createTestUser(db);
});

afterEach(() => harness.close());

const at = (id: string, user: TestUser | null) => fakeEvent({ db, user, params: { id } });

test('shows each side their own view of the same link', async () => {
	const { id } = await createTestPartnership(db, ada, jun, {
		yourName: 'Ada',
		partnerName: 'Jun',
		partnerRole: 'sub',
		yourRole: 'dom',
		control: 'me'
	});

	expect((await runLoad(load(at(id, ada)))).partner).toEqual({
		id,
		name: 'Jun',
		yourName: 'Ada',
		image: null,
		timezone: 'America/New_York',
		partnerRole: 'sub',
		yourRole: 'dom',
		canEdit: true
	});

	expect((await runLoad(load(at(id, jun)))).partner).toEqual({
		id,
		name: 'Ada',
		yourName: 'Jun',
		image: '/ada.png',
		timezone: 'Europe/London',
		partnerRole: 'dom',
		yourRole: 'sub',
		canEdit: false
	});
});

/**
 * The asymmetry is the whole point of these two tests.
 *
 * One side manages tasks and rewards; the other completes and claims them. A
 * "ready to do" list shown to the manager would be somebody else's to-do list,
 * so the cards diverge — and the titles are withheld from the manager on the
 * server rather than merely hidden in the component.
 */
test('gives the side that completes a task a preview of it', async () => {
	const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
	await createTestPartnershipTask(db, id, ada, { title: 'Kneel at eight', creditsAwarded: 3 });

	const junsView = await runLoad(load(at(id, jun)));
	expect(junsView.tasks).toMatchObject({
		viewerActs: true,
		readyCount: 1,
		ready: [{ title: 'Kneel at eight', note: '+3' }]
	});

	const adasView = await runLoad(load(at(id, ada)));
	expect(adasView.tasks).toMatchObject({ viewerActs: false, activeCount: 1, ready: [] });
});

test('gives the side that claims a reward its balance, and the other side a count', async () => {
	const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
	await createTestPartnershipReward(db, id, ada, { title: 'An hour off', cost: 4 });
	await createTestPartnershipReward(db, id, ada, { title: 'A whole day off', cost: 40 });
	await setTestPartnershipRewardCredits(db, id, ada, jun, 4);

	const junsView = await runLoad(load(at(id, jun)));
	expect(junsView.rewards).toMatchObject({
		// One scope on a partner page, so one unlabelled balance. /home is the
		// page that has several and has to tell them apart.
		balances: [{ label: null, credits: 4 }],
		viewerActs: true,
		claimable: [{ title: 'An hour off', note: '4' }],
		activeCount: 2
	});

	const adasView = await runLoad(load(at(id, ada)));
	expect(adasView.rewards).toMatchObject({ viewerActs: false, activeCount: 2, claimable: [] });
});

test('counts unread threads without any way to read them', async () => {
	const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
	await createTestThread(db, id, ada, { at: new Date('2026-09-13T12:00:00Z') });

	const junsView = await runLoad(load(at(id, jun)));
	expect(junsView.messages).toMatchObject({ unreadThreads: 1, totalThreads: 1 });

	// Ada wrote it, so it is not unread for her — the same predicate /home uses.
	const adasView = await runLoad(load(at(id, ada)));
	expect(adasView.messages).toMatchObject({ unreadThreads: 0, totalThreads: 1 });
});

test('404s for a pending invite — there is nobody there yet', async () => {
	const invite = await createTestInvite(db, ada);
	const result = await runAndCatch(() => runLoad(load(at(invite.id, ada))));
	expect(result).toMatchObject({ type: 'error', status: 404 });
});

test('404s for someone else’s partnership', async () => {
	const { id } = await createTestPartnership(db, ada, jun);
	const result = await runAndCatch(() => runLoad(load(at(id, stranger))));
	expect(result).toMatchObject({ type: 'error', status: 404 });
});

test('401s without a session', async () => {
	const { id } = await createTestPartnership(db, ada, jun);
	const result = await runAndCatch(() => runLoad(load(at(id, null))));
	expect(result).toMatchObject({ type: 'error', status: 401 });
});
