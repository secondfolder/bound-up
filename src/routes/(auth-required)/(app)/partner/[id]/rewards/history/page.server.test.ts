import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runLoad } from '$lib/testing/events';
import {
	claimTestPartnershipReward,
	createTestPartnership,
	createTestPartnershipReward,
	createTestUser,
	setTestPartnershipRewardCredits,
	type TestUser
} from '$lib/testing/fixtures';
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

const at = (id: string, user: TestUser | null) =>
	fakeEvent({ db, user, params: { id }, path: `/partner/${id}/rewards/history` });

describe('load', () => {
	it('returns the reward claim history for a member', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const reward = await createTestPartnershipReward(db, id, jun, { title: 'Snack', cost: 2 });
		await setTestPartnershipRewardCredits(db, id, jun, ada, 4);
		await claimTestPartnershipReward(db, id, ada, reward.id);

		const data = await runLoad(load(at(id, ada)));
		expect(data.claims).toContainEqual(
			expect.objectContaining({ rewardTitle: 'Snack', mine: true, createdByMe: false })
		);
	});
});
