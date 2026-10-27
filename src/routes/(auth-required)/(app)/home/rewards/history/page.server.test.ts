import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runLoad } from '$lib/testing/events';
import {
	claimTestSelfReward,
	createTestSelfReward,
	createTestUser,
	setTestSelfRewardCredits,
	type TestUser
} from '$lib/testing/fixtures';
import { load } from './+page.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
});

afterEach(() => harness.close());

const at = (user: TestUser | null) => fakeEvent({ db, user, path: '/home/rewards/history' });

describe('load', () => {
	it('returns the self reward claim history', async () => {
		const reward = await createTestSelfReward(db, ada, { cost: 2 });
		await setTestSelfRewardCredits(db, ada, 4);
		await claimTestSelfReward(db, ada, reward.id);

		const data = await runLoad(load(at(ada)));
		// The claim keeps a copy of the reward's sealed record, bound to the reward.
		expect(data.selfRewards.claims).toContainEqual(
			expect.objectContaining({
				rewardCost: 2,
				sealed: expect.objectContaining({ recordId: reward.id, ciphertext: reward.ciphertext })
			})
		);
	});
});
