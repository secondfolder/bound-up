import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FeatureKey } from '$lib/features';
import type { Db } from '$lib/server/db';
import { guides, iqTestResults } from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runLoad } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestPartnership,
	createTestPartnershipReward,
	createTestPartnershipTask,
	createTestSelfReward,
	createTestSelfTask,
	createTestThread,
	createTestUser,
	setTestPartnershipRewardCredits,
	setTestSelfRewardCredits,
	type TestUser,
	testSoloSpace
} from '$lib/testing/fixtures';
import { testPartnerView } from '$lib/testing/names';
import type { PartnerView } from '$lib/types';
import { load } from './+page.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
});

afterEach(() => harness.close());

function at(user: TestUser | null, partners = [] as PartnerView[], features = [] as FeatureKey[]) {
	return fakeEvent({ db, user, path: '/home', parentData: { partners, features } });
}

describe('load', () => {
	it('returns unread partner links from the layout partner list', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		await createTestThread(db, id, jun, { at: new Date('2026-09-13T12:00:00Z') });

		const data = await runLoad(load(at(ada, [testPartnerView(id, 'Jun')])));
		expect(data.unread).toContainEqual(
			expect.objectContaining({
				partnershipId: id,
				names: testPartnerView(id, 'Jun').names,
				unreadThreads: 1
			})
		);
	});

	it('previews the tasks that are ready to do right now', async () => {
		const stretches = await createTestSelfTask(db, ada, { creditsAwarded: 2 });
		await createTestSelfTask(db, ada, { active: false });

		const data = await runLoad(load(at(ada)));
		expect(data.tasks.viewerActs).toBe(true);
		// The inactive one is not counted at all — a card that promised four
		// tasks and showed one would be worse than no card.
		expect(data.tasks.activeCount).toBe(1);
		expect(data.tasks.ready).toEqual([
			{
				id: stretches.id,
				title: '',
				kind: 'task',
				sealed: expect.objectContaining({
					recordId: stretches.id,
					ciphertext: stretches.ciphertext
				}),
				note: '+2',
				context: null
			}
		]);
	});

	it('previews only the rewards the balance actually covers', async () => {
		await setTestSelfRewardCredits(db, ada, 5);
		const bath = await createTestSelfReward(db, ada, { cost: 5 });
		await createTestSelfReward(db, ada, { cost: 50 });

		const data = await runLoad(load(at(ada)));
		expect(data.rewards.balances).toEqual([
			{ id: await testSoloSpace(db, ada.id), label: null, credits: 5 }
		]);
		expect(data.rewards.claimable).toEqual([
			{
				id: bath.id,
				title: '',
				kind: 'reward',
				sealed: expect.objectContaining({ recordId: bath.id, ciphertext: bath.ciphertext }),
				note: '5',
				context: null
			}
		]);
		// The unaffordable one is simply absent: the card never names a reward
		// the balance does not cover.
		expect(data.rewards.claimableCount).toBe(1);
		expect(data.rewards.activeCount).toBe(2);
	});

	/**
	 * The cards are an overview of /tasks and /rewards in Everyone, which is
	 * where they lead, and those show your own things and every partner's. A
	 * card that read only the solo half reported "nothing to do" with a
	 * partner task waiting, which is the opposite of what the cards are for.
	 */
	it('carries partner tasks and rewards into the cards, not just your own', async () => {
		// Jun controls, so what Jun sets up is Ada's to do and to claim.
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const own = await createTestSelfTask(db, ada);
		const junsTask = await createTestPartnershipTask(db, id, jun);
		const junsReward = await createTestPartnershipReward(db, id, jun, { cost: 1 });
		await setTestPartnershipRewardCredits(db, id, jun, ada, 1);

		const data = await runLoad(load(at(ada, [testPartnerView(id, 'Jun')])));

		expect(data.tasks.ready).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: own.id, context: null }),
				expect.objectContaining({ id: junsTask.id, context: testPartnerView(id, 'Jun').names })
			])
		);
		expect(data.rewards.claimable).toEqual([
			expect.objectContaining({ id: junsReward.id, context: testPartnerView(id, 'Jun').names })
		]);
		// Both balances, separately — partnership credits do not buy self rewards.
		expect(data.rewards.balances).toEqual([
			{ id: await testSoloSpace(db, ada.id), label: null, credits: 0 },
			{ id, label: testPartnerView(id, 'Jun').names, credits: 1 }
		]);
	});

	describe('the daydreams card', () => {
		it('is absent for an account without the daydreams feature', async () => {
			await createTestDaydream(db, ada.id);
			expect((await runLoad(load(at(ada)))).daydreams).toBeNull();
		});

		it("previews the account's own daydreams, and counts them all", async () => {
			for (let index = 0; index < 4; index += 1) {
				await createTestDaydream(db, ada.id);
			}
			await createTestDaydream(db, jun.id);
			const data = await runLoad(load(at(ada, [], ['daydreams'])));
			expect(data.daydreams?.daydreams).toHaveLength(3);
			expect(data.daydreams?.total).toBe(4);
		});
	});

	describe('the guides card', () => {
		beforeEach(async () => {
			// Explicit times: the card's order is createdAt then id, and ids are
			// UUIDs, so rows inserted in the same millisecond would sort at random.
			await db.insert(guides).values(
				['First', 'Second', 'Third', 'Fourth'].map((title, index) => ({
					title,
					createdAt: new Date(Date.UTC(2026, 0, index + 1))
				}))
			);
		});

		it('is absent for an account without the guides feature', async () => {
			const data = await runLoad(load(at(ada)));
			expect(data.guides).toBeNull();
		});

		it('previews the first guides, and counts them all, for an account that has it', async () => {
			const data = await runLoad(load(at(ada, [], ['guides'])));
			expect(data.guides).toEqual({
				guides: [
					{ id: expect.any(String), title: 'First' },
					{ id: expect.any(String), title: 'Second' },
					{ id: expect.any(String), title: 'Third' }
				],
				total: 4
			});
		});
	});

	it('degrades to an empty home feed without a session', async () => {
		const data = await runLoad(load(at(null)));
		expect(data).toEqual({
			unread: [],
			guides: null,
			daydreams: null,
			tasks: { viewerActs: true, ready: [], readyCount: 0, waitingCount: 0, activeCount: 0 },
			rewards: {
				viewerActs: true,
				balances: [],
				claimable: [],
				claimableCount: 0,
				activeCount: 0
			},
			latestIq: null,
			notebook: []
		});
	});

	it("gives the Playroom card the user's newest IQ result, and only theirs", async () => {
		expect((await runLoad(load(at(ada)))).latestIq).toBeNull();

		const result = {
			role: 'sub' as const,
			intensity: 0 as const,
			vibe: null,
			correct: 4,
			attempted: 12,
			soberIq: null,
			targetIq: null,
			seed: 1
		};
		await db.insert(iqTestResults).values([
			{ ...result, ownerId: ada.id, iq: 90, createdAt: new Date('2026-10-01T10:00:00Z') },
			{ ...result, ownerId: ada.id, iq: 70, createdAt: new Date('2026-10-02T10:00:00Z') },
			{ ...result, ownerId: jun.id, iq: 130, createdAt: new Date('2026-10-03T10:00:00Z') }
		]);
		expect((await runLoad(load(at(ada)))).latestIq?.iq).toBe(70);
	});
});
