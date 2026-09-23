import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestInvite,
	createTestPartnership,
	createTestPartnershipReward,
	createTestUser,
	readPartnershipRewardClaimRows,
	readPartnershipRewardCreditRow,
	readPartnershipRewardRows,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;
let stranger: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
	stranger = await createTestUser(db, { name: 'Stranger' });
});

afterEach(() => harness.close());

const at = (id: string, user: TestUser | null, formData?: Record<string, string>) =>
	fakeEvent({ db, user, params: { id }, formData, path: `/partner/${id}/rewards` });

const run = (name: string, event: never) => runAction(actions, name, event);

describe('load', () => {
	it('returns the partner rewards page view for a member', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		await createTestPartnershipReward(db, id, jun, { title: 'Treat', cost: 2 });

		const data = await runLoad(load(at(id, ada)));
		expect(data).toMatchObject({
			partner: {
				id,
				name: 'Them',
				canManageRewards: false,
				canClaimRewards: true
			}
		});
		expect(data.rewards).toContainEqual(
			expect.objectContaining({ title: 'Treat', createdByMe: false })
		);
	});

	it('404s for a pending invite', async () => {
		const invite = await createTestInvite(db, ada);
		const result = await runAndCatch(() => runLoad(load(at(invite.id, ada))));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it('404s for someone else’s partnership', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		const result = await runAndCatch(() => runLoad(load(at(id, stranger))));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});

describe('actions', () => {
	it('refuses reward creation from the non-controlling side', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		await expect(readPartnershipRewardRows(db, id)).resolves.toEqual([]);
	});

	it("lets the controller set the other person's reward credits", async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const result = await run('setCredits', at(id, ada, { targetUserId: jun.id, credits: '7' }));

		expect(result).toMatchObject({ message: 'Reward credits updated.' });
		await expect(readPartnershipRewardCreditRow(db, id, jun.id)).resolves.toMatchObject({
			credits: 7
		});
	});

	it('lets the claimant side claim a partner reward', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const reward = await createTestPartnershipReward(db, id, jun, { title: 'Snack', cost: 2 });
		await run('setCredits', at(id, jun, { targetUserId: ada.id, credits: '4' }));

		const result = await run('claimReward', at(id, ada, { rewardId: reward.id }));
		expect(result).toMatchObject({ message: 'Reward claimed.' });
		await expect(readPartnershipRewardCreditRow(db, id, ada.id)).resolves.toMatchObject({
			credits: 2
		});
		await expect(readPartnershipRewardClaimRows(db, id)).resolves.toContainEqual(
			expect.objectContaining({ rewardId: reward.id, claimedByUserId: ada.id })
		);
	});

	it('blocks claiming your own shared-control reward', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const reward = await createTestPartnershipReward(db, id, ada, { title: 'Own reward', cost: 2 });

		const result = await run('claimReward', at(id, ada, { rewardId: reward.id }));
		expect(result.status).toBe(403);
		await expect(readPartnershipRewardClaimRows(db, id)).resolves.toEqual([]);
	});
});
