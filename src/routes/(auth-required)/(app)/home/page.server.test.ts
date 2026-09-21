import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { load } from './+page.server';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import {
	createTestPartnership,
	createTestPartnershipReward,
	createTestPartnershipTask,
	createTestSelfReward,
	createTestSelfTask,
	createTestThread,
	createTestUser,
	setTestPartnershipRewardCredits,
	setTestSelfRewardCredits,
	type TestUser
} from '$lib/testing/fixtures';
import { fakeEvent, runLoad } from '$lib/testing/events';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	db = harness.db;
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
});

afterEach(() => harness.close());

function at(
	user: TestUser | null,
	partners = [] as { id: string; name: string; image: string | null }[]
) {
	return Object.assign(fakeEvent({ db, user, path: '/home' }), {
		parent: async () => ({ partners })
	});
}

describe('load', () => {
	test('returns unread partner links from the layout partner list', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		await createTestThread(db, id, jun, { at: new Date('2026-09-13T12:00:00Z') });

		const data = await runLoad(load(at(ada, [{ id, name: 'Jun', image: null }])));
		expect(data.unread).toContainEqual(
			expect.objectContaining({
				partnershipId: id,
				name: 'Jun',
				unreadThreads: 1
			})
		);
	});

	test('previews the tasks that are ready to do right now', async () => {
		await createTestSelfTask(db, ada, { title: 'Morning stretches', creditsAwarded: 2 });
		await createTestSelfTask(db, ada, { title: 'Shelved for later', active: false });

		const data = await runLoad(load(at(ada)));
		expect(data.tasks.viewerActs).toBe(true);
		// The inactive one is not counted at all — a card that promised four
		// tasks and showed one would be worse than no card.
		expect(data.tasks.activeCount).toBe(1);
		expect(data.tasks.ready).toEqual([
			{ id: expect.any(String), title: 'Morning stretches', note: '+2', context: null }
		]);
	});

	test('previews only the rewards the balance actually covers', async () => {
		await setTestSelfRewardCredits(db, ada, 5);
		await createTestSelfReward(db, ada, { title: 'Long bath', cost: 5 });
		await createTestSelfReward(db, ada, { title: 'Weekend away', cost: 50 });

		const data = await runLoad(load(at(ada)));
		expect(data.rewards.balances).toEqual([{ id: 'self', label: null, credits: 5 }]);
		expect(data.rewards.claimable).toEqual([
			{ id: expect.any(String), title: 'Long bath', note: '5', context: null }
		]);
		// The unaffordable one is simply absent: the card never names a reward
		// the balance does not cover.
		expect(data.rewards.claimableCount).toBe(1);
		expect(data.rewards.activeCount).toBe(2);
	});

	/**
	 * The cards are an overview of /home/tasks and /home/rewards, and both of
	 * those pages show your own section plus one per partner. A card that read
	 * only the self half reported "nothing to do" with a partner task waiting,
	 * which is the opposite of what the cards are for.
	 */
	test('carries partner tasks and rewards into the cards, not just your own', async () => {
		// Jun controls, so what Jun sets up is Ada's to do and to claim.
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		await createTestSelfTask(db, ada, { title: 'Ada’s own task' });
		await createTestPartnershipTask(db, id, jun, { title: 'Jun’s task for Ada' });
		await createTestPartnershipReward(db, id, jun, { title: 'Jun’s reward', cost: 1 });
		await setTestPartnershipRewardCredits(db, id, jun, ada, 1);

		const data = await runLoad(load(at(ada, [{ id, name: 'Jun', image: null }])));

		expect(data.tasks.ready).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ title: 'Ada’s own task', context: null }),
				expect.objectContaining({ title: 'Jun’s task for Ada', context: 'Jun' })
			])
		);
		expect(data.rewards.claimable).toEqual([
			expect.objectContaining({ title: 'Jun’s reward', context: 'Jun' })
		]);
		// Both balances, separately — partnership credits do not buy self rewards.
		expect(data.rewards.balances).toEqual([
			{ id: 'self', label: null, credits: 0 },
			{ id, label: 'Jun', credits: 1 }
		]);
	});

	test('degrades to an empty home feed without a session', async () => {
		const data = await runLoad(load(at(null)));
		expect(data).toEqual({
			unread: [],
			guides: { guides: [], total: 0 },
			tasks: { viewerActs: true, ready: [], readyCount: 0, waitingCount: 0, activeCount: 0 },
			rewards: {
				viewerActs: true,
				balances: [],
				claimable: [],
				claimableCount: 0,
				activeCount: 0
			}
		});
	});
});
