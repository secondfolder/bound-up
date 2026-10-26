import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestInvite,
	createTestPartnership,
	createTestPartnershipReward,
	createTestUser,
	ensureTestPartnershipVault,
	fakeSealed,
	readPartnershipRewardClaimRows,
	readPartnershipRewardCreditRow,
	readPartnershipRewardRow,
	readPartnershipRewardRows,
	type TestUser
} from '$lib/testing/fixtures';
import { load } from './+layout.server';
import { actions } from './+page.server';

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
		const reward = await createTestPartnershipReward(db, id, jun, { cost: 2 });

		const data = await runLoad(load(at(id, ada)));
		expect(data).toMatchObject({
			partner: {
				id,
				names: expect.objectContaining({ partnershipId: id, role: 'inviter' }),
				canManageRewards: false,
				canClaimRewards: true
			}
		});
		expect(data.rewards).toContainEqual(
			expect.objectContaining({
				id: reward.id,
				createdByMe: false,
				sealed: expect.objectContaining({ ciphertext: reward.ciphertext })
			})
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
		const reward = await createTestPartnershipReward(db, id, jun, { cost: 2 });
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
		const reward = await createTestPartnershipReward(db, id, ada, { cost: 2 });

		const result = await run('claimReward', at(id, ada, { rewardId: reward.id }));
		expect(result.status).toBe(403);
		await expect(readPartnershipRewardClaimRows(db, id)).resolves.toEqual([]);
	});
});

describe('rewardContent', () => {
	/** The content a tick posts: the server stores it as it arrives. */
	const Ticked = fakeSealed('ticked');

	async function contentPost(partnershipId: string, rewardId: string) {
		return {
			recordId: rewardId,
			vaultId: await ensureTestPartnershipVault(db, partnershipId),
			ciphertext: Ticked,
			payloadVersion: '1',
			expectedRevision: '0'
		};
	}

	it("saves a tick in the reward's content for the managing side", async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const reward = await createTestPartnershipReward(db, id, jun, { cost: 4 });

		const result = await run('rewardContent', at(id, jun, await contentPost(id, reward.id)));
		expect(result).toEqual({ saved: true });
		await expect(readPartnershipRewardRow(db, reward.id)).resolves.toMatchObject({
			ciphertext: Ticked,
			revision: 1,
			cost: 4
		});
	});

	it('refuses the side that only claims, as editing it would be', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const reward = await createTestPartnershipReward(db, id, jun);

		const result = await run('rewardContent', at(id, ada, await contentPost(id, reward.id)));
		expect(result).toMatchObject({ status: 403 });
		await expect(readPartnershipRewardRow(db, reward.id)).resolves.toMatchObject({ revision: 0 });
	});

	it('404s from outside the partnership', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const reward = await createTestPartnershipReward(db, id, jun);
		const post = await contentPost(id, reward.id);

		const result = await runAndCatch(() => run('rewardContent', at(id, stranger, post)));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});
