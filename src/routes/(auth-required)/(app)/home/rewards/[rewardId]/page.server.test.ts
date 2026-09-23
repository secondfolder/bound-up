import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestSelfReward,
	createTestUser,
	readSelfRewardRow,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
});

afterEach(() => harness.close());

const at = (rewardId: string, user: TestUser | null, formData?: Record<string, string>) =>
	fakeEvent({ db, user, params: { rewardId }, formData, path: `/home/rewards/${rewardId}` });

describe('load', () => {
	it('loads one existing self reward', async () => {
		const reward = await createTestSelfReward(db, ada, { title: 'Bath', cost: 2 });
		await expect(runLoad(load(at(reward.id, ada)))).resolves.toMatchObject({
			reward: { id: reward.id, title: 'Bath', cost: 2 }
		});
	});
});

describe('actions', () => {
	it('updates the reward and redirects back to /home/rewards', async () => {
		const reward = await createTestSelfReward(db, ada, { title: 'Bath', cost: 2 });
		const result = await runAndCatch(() =>
			actions.default?.(
				at(reward.id, ada, {
					title: 'Bath time',
					description: 'Hot bath',
					cost: '3',
					active: 'on'
				})
			)
		);

		expect(result).toMatchObject({ type: 'redirect', status: 303, location: '/home/rewards' });
		await expect(readSelfRewardRow(db, reward.id)).resolves.toMatchObject({
			title: 'Bath time',
			cost: 3
		});
	});
});
