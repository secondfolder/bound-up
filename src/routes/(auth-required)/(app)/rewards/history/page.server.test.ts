import { afterEach, beforeEach, expect, it as test } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runLoad } from '$lib/testing/events';
import {
	claimTestReward,
	createTestPartnership,
	createTestPartnershipReward,
	createTestSelfReward,
	createTestUser,
	setTestBalance,
	type TestUser,
	testSoloSpace
} from '$lib/testing/fixtures';
import type { RewardClaimView } from '$lib/types';
import { load } from './+page.server';

/** The claim history follows the context, as the wallets do. */

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

const at = (user: TestUser, context: string) =>
	fakeEvent({ db, user, path: '/rewards/history', contextCookie: context });

test('shows the claims in the context’s spaces, saying who claimed each', async () => {
	const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
	const own = await createTestSelfReward(db, ada, { cost: 0 });
	const forJun = await createTestPartnershipReward(db, id, ada, { cost: 1 });
	await setTestBalance(db, id, ada, jun, 1);
	await claimTestReward(db, ada, own.id);
	await claimTestReward(db, jun, forJun.id);

	const everyone = await runLoad(load(at(ada, 'all')));
	expect(everyone.claims).toHaveLength(2);
	expect(everyone.claims.find((claim: RewardClaimView) => claim.spaceId === id)).toMatchObject({
		mine: false,
		createdByMe: true,
		rewardCost: 1
	});
	const me = await runLoad(load(at(ada, await testSoloSpace(db, ada.id))));
	expect(me.claims.map((claim: RewardClaimView) => claim.mine)).toEqual([true]);
});
