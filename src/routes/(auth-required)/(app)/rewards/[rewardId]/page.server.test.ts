import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestPartnershipReward,
	createTestSelfReward,
	createTestUser,
	ensureTestPartnershipVault,
	fakeSealed,
	readRewardRow,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

/**
 * Editing a reward: from any context, by whoever may — their own, or one they
 * keep for someone else. Never by whoever it is for, who could otherwise set
 * the price of what they claim.
 */

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

const at = (user: TestUser, rewardId: string, formData?: Record<string, string>) =>
	fakeEvent({ db, user, params: { rewardId }, path: `/rewards/${rewardId}`, formData });

describe('load', () => {
	it('opens your own reward and one you set, and 403s one set for you', async () => {
		const own = await createTestSelfReward(db, ada);
		await expect(runLoad(load(at(ada, own.id)))).resolves.toMatchObject({
			reward: { id: own.id, canManage: true },
			space: { kind: 'solo' }
		});
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const forJun = await createTestPartnershipReward(db, id, ada);
		await expect(runLoad(load(at(ada, forJun.id)))).resolves.toMatchObject({
			space: { id, kind: 'shared' }
		});
		await expect(runAndCatch(() => runLoad(load(at(jun, forJun.id))))).resolves.toMatchObject({
			type: 'error',
			status: 403
		});
	});

	it('404s a reward in a space you are not in', async () => {
		const reward = await createTestSelfReward(db, jun);
		await expect(runAndCatch(() => runLoad(load(at(ada, reward.id))))).resolves.toMatchObject({
			type: 'error',
			status: 404
		});
	});
});

describe('the action', () => {
	it('saves for whoever set it and refuses whoever it is for', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const reward = await createTestPartnershipReward(db, id, ada);
		const form = {
			recordId: reward.id,
			vaultId: await ensureTestPartnershipVault(db, id),
			ciphertext: fakeSealed('edited'),
			payloadVersion: '1',
			cost: '0',
			active: 'on',
			expectedRevision: '0'
		};
		await expect(actions.default?.(at(jun, reward.id, form))).resolves.toMatchObject({
			status: 403
		});
		await expect(
			runAndCatch(() => actions.default?.(at(ada, reward.id, form)))
		).resolves.toMatchObject({
			type: 'redirect',
			location: '/rewards'
		});
		await expect(readRewardRow(db, reward.id)).resolves.toMatchObject({ cost: 0, revision: 1 });
	});
});
