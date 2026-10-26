import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestPartnershipReward,
	createTestSelfReward,
	createTestUser,
	ensureTestSelfVault,
	fakeSealed,
	readPartnershipRewardClaimRows,
	readSelfRewardCreditRow,
	readSelfRewardRow,
	setTestPartnershipRewardCredits,
	setTestSelfRewardCredits,
	type TestUser
} from '$lib/testing/fixtures';
import { testPartnerView } from '$lib/testing/names';
import type { PartnerView } from '$lib/types';
import { load } from './+layout.server';
import { actions } from './+page.server';

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

function at(
	user: TestUser | null,
	formData?: Record<string, string>,
	partners = [] as PartnerView[]
) {
	return fakeEvent({ db, user, formData, path: '/home/rewards', parentData: { partners } });
}

const run = (name: string, event: never) => runAction(actions, name, event);

describe('load', () => {
	it('returns self rewards and partner sections', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const own = await createTestSelfReward(db, ada, { cost: 1 });
		await setTestSelfRewardCredits(db, ada, 3);
		const theirs = await createTestPartnershipReward(db, id, jun, { cost: 2 });
		await setTestPartnershipRewardCredits(db, id, jun, ada, 4);

		const data = await runLoad(load(at(ada, undefined, [testPartnerView(id, 'Jun')])));
		expect(data.selfRewards).toMatchObject({ credits: 3 });
		expect(data.selfRewards.rewards).toContainEqual(
			expect.objectContaining({
				id: own.id,
				canClaim: true,
				sealed: expect.objectContaining({ recordId: own.id, ciphertext: own.ciphertext })
			})
		);
		expect(data.partnerRewards).toContainEqual(
			expect.objectContaining({
				partnershipId: id,
				names: testPartnerView(id, 'Jun').names,
				rewards: [
					expect.objectContaining({
						id: theirs.id,
						canClaim: true,
						sealed: expect.objectContaining({ ciphertext: theirs.ciphertext })
					})
				]
			})
		);
	});

	it('includes an empty section for a partner with no claimable rewards', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const data = await runLoad(load(at(ada, undefined, [testPartnerView(id, 'Jun')])));
		expect(data.partnerRewards).toContainEqual(
			expect.objectContaining({
				partnershipId: id,
				names: testPartnerView(id, 'Jun').names,
				rewards: []
			})
		);
	});

	it('omits a controller-only partnership from the claimable partner sections', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		await createTestPartnershipReward(db, id, ada, { cost: 2 });

		const data = await runLoad(load(at(ada, undefined, [testPartnerView(id, 'Jun')])));
		expect(data.partnerRewards).toEqual([]);
	});

	it('degrades to an empty rewards page without a session', async () => {
		await expect(runLoad(load(at(null)))).resolves.toEqual({
			selfRewards: { credits: 0, rewards: [], claims: [] },
			partnerRewards: []
		});
	});
});

describe('actions', () => {
	it('claims a self reward and deducts credits', async () => {
		const reward = await createTestSelfReward(db, ada, { cost: 2 });
		await setTestSelfRewardCredits(db, ada, 5);

		const result = await run('selfClaimReward', at(ada, { rewardId: reward.id }));
		expect(result).toMatchObject({ message: 'Reward claimed.' });
		await expect(readSelfRewardCreditRow(db, ada.id)).resolves.toMatchObject({ credits: 3 });
	});

	it('claims a partner reward from the rewards hub', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const reward = await createTestPartnershipReward(db, id, jun, { cost: 2 });
		await setTestPartnershipRewardCredits(db, id, jun, ada, 4);

		const result = await run(
			'partnerClaimReward',
			at(ada, { partnershipId: id, rewardId: reward.id }, [testPartnerView(id, 'Jun')])
		);
		expect(result).toMatchObject({ message: 'Reward claimed.' });
		await expect(readPartnershipRewardClaimRows(db, id)).resolves.toContainEqual(
			expect.objectContaining({ rewardId: reward.id, claimedByUserId: ada.id })
		);
	});

	it('401s without a session when an action runs', async () => {
		const result = await runAndCatch(() => run('selfSetCredits', at(null, { credits: '1' })));
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});
});

describe('selfRewardContent', () => {
	/** The content a tick posts: the server stores it as it arrives. */
	const Ticked = fakeSealed('ticked');

	/** A tick as the reward's sheet posts it: the content re-sealed, and nothing else. */
	async function contentPost(rewardId: string, expectedRevision = '0') {
		return {
			recordId: rewardId,
			vaultId: await ensureTestSelfVault(db, ada.id),
			ciphertext: Ticked,
			payloadVersion: '1',
			expectedRevision
		};
	}

	it('saves the content alone, leaving the cost and whether it is active', async () => {
		const reward = await createTestSelfReward(db, ada, { cost: 7, active: false });

		const result = await run('selfRewardContent', at(ada, await contentPost(reward.id)));
		expect(result).toEqual({ saved: true });
		await expect(readSelfRewardRow(db, reward.id)).resolves.toMatchObject({
			ciphertext: Ticked,
			revision: 1,
			cost: 7,
			active: false
		});
	});

	it('refuses a tick made on an out-of-date copy', async () => {
		const reward = await createTestSelfReward(db, ada);
		await run('selfRewardContent', at(ada, await contentPost(reward.id)));

		const result = await run('selfRewardContent', at(ada, await contentPost(reward.id)));
		expect(result).toMatchObject({ status: 409 });
		const next = await run('selfRewardContent', at(ada, await contentPost(reward.id, '1')));
		expect(next).toEqual({ saved: true });
	});

	it("does not find someone else's reward", async () => {
		const reward = await createTestSelfReward(db, ada);
		const post = {
			...(await contentPost(reward.id)),
			vaultId: await ensureTestSelfVault(db, jun.id)
		};
		const result = await runAndCatch(() => run('selfRewardContent', at(jun, post)));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});
