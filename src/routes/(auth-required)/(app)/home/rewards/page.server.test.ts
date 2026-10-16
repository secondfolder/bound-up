import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestPartnershipReward,
	createTestSelfReward,
	createTestUser,
	readPartnershipRewardClaimRows,
	readSelfRewardCreditRow,
	setTestPartnershipRewardCredits,
	setTestSelfRewardCredits,
	type TestUser
} from '$lib/testing/fixtures';
import { testPartnerView } from '$lib/testing/names';
import type { PartnerView } from '$lib/types';
import { actions, load } from './+page.server';

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
