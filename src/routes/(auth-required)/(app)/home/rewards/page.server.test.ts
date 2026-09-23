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
	readSelfRewardRow,
	setTestPartnershipRewardCredits,
	setTestSelfRewardCredits,
	type TestUser
} from '$lib/testing/fixtures';
import type { SelfRewardView } from '$lib/types';
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
	partners = [] as { id: string; name: string; image: string | null }[]
) {
	return fakeEvent({ db, user, formData, path: '/home/rewards', parentData: { partners } });
}

const run = (name: string, event: never) => runAction(actions, name, event);

describe('load', () => {
	it('returns self rewards and partner sections', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		await createTestSelfReward(db, ada, { title: 'Self treat', cost: 1 });
		await setTestSelfRewardCredits(db, ada, 3);
		await createTestPartnershipReward(db, id, jun, { title: 'Partner treat', cost: 2 });
		await setTestPartnershipRewardCredits(db, id, jun, ada, 4);

		const data = await runLoad(load(at(ada, undefined, [{ id, name: 'Jun', image: null }])));
		expect(data.selfRewards).toMatchObject({ credits: 3 });
		expect(data.selfRewards.rewards).toContainEqual(
			expect.objectContaining({ title: 'Self treat', canClaim: true })
		);
		expect(data.partnerRewards).toContainEqual(
			expect.objectContaining({
				partnershipId: id,
				name: 'Jun',
				rewards: [expect.objectContaining({ title: 'Partner treat', canClaim: true })]
			})
		);
	});

	it('includes an empty section for a partner with no claimable rewards', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const data = await runLoad(load(at(ada, undefined, [{ id, name: 'Jun', image: null }])));
		expect(data.partnerRewards).toContainEqual(
			expect.objectContaining({ partnershipId: id, name: 'Jun', rewards: [] })
		);
	});

	it('omits a controller-only partnership from the claimable partner sections', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		await createTestPartnershipReward(db, id, ada, { title: 'Tea', cost: 2 });

		const data = await runLoad(load(at(ada, undefined, [{ id, name: 'Jun', image: null }])));
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
	it('updates a self reward from the rewards hub', async () => {
		await createTestSelfReward(db, ada, { title: 'Bath', description: 'Long soak', cost: 2 });
		const section = await runLoad(load(at(ada)));
		const reward = section.selfRewards.rewards.find(
			(entry: SelfRewardView) => entry.title === 'Bath'
		);
		if (!reward) {
			throw new Error('reward not created');
		}

		await run(
			'selfUpdateReward',
			at(ada, {
				rewardId: reward.id,
				title: 'Bath time',
				description: 'Hot bath',
				cost: '3',
				active: 'on'
			})
		);

		await expect(readSelfRewardRow(db, reward.id)).resolves.toMatchObject({
			title: 'Bath time',
			cost: 3
		});
	});

	it('claims a self reward and deducts credits', async () => {
		const reward = await createTestSelfReward(db, ada, { title: 'Nap', cost: 2 });
		await setTestSelfRewardCredits(db, ada, 5);

		const result = await run('selfClaimReward', at(ada, { rewardId: reward.id }));
		expect(result).toMatchObject({ message: 'Reward claimed.' });
		await expect(readSelfRewardCreditRow(db, ada.id)).resolves.toMatchObject({ credits: 3 });
	});

	it('claims a partner reward from the rewards hub', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const reward = await createTestPartnershipReward(db, id, jun, { title: 'Tea', cost: 2 });
		await setTestPartnershipRewardCredits(db, id, jun, ada, 4);

		const result = await run(
			'partnerClaimReward',
			at(ada, { partnershipId: id, rewardId: reward.id }, [{ id, name: 'Jun', image: null }])
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
