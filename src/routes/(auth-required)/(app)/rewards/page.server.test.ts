import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	completeTestTask,
	createTestPartnership,
	createTestPartnershipReward,
	createTestPartnershipTask,
	createTestSelfReward,
	createTestUser,
	ensureTestPartnershipVault,
	fakeSealed,
	readBalanceRow,
	readRewardClaimRows,
	readRewardRow,
	setTestBalance,
	type TestUser,
	testSoloSpace
} from '$lib/testing/fixtures';
import type { RewardsListView, RewardView, RewardWalletView } from '$lib/types';
import { load } from './+layout.server';
import { actions } from './+page.server';

/**
 * The rewards in every context, as wallets — one per balance, never merged —
 * and their actions, each naming its reward or its balance's space and
 * member. See docs/rewards.md and docs/contexts.md.
 */

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;
let kit: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
	kit = await createTestUser(db, { name: 'Kit' });
});

afterEach(() => harness.close());

function at(
	user: TestUser | null,
	options: { context?: string; formData?: Record<string, string> } = {}
) {
	return fakeEvent({
		db,
		user,
		path: '/rewards',
		...(options.context === undefined ? {} : { contextCookie: options.context }),
		...(options.formData ? { formData: options.formData } : {})
	});
}

const run = (name: string, event: never) => runAction(actions, name, event);

/** Each wallet as whose it is, whose space, and the rewards in it. */
const walletsOf = (list: RewardsListView) =>
	list.wallets.map((wallet: RewardWalletView) => ({
		spaceId: wallet.spaceId,
		userId: wallet.userId,
		mine: wallet.mine,
		credits: wallet.credits,
		rewards: wallet.rewards.map((reward: RewardView) => reward.id)
	}));

async function listFor(user: TestUser, context: string): Promise<RewardsListView> {
	return (await runLoad(load(at(user, { context })))).list;
}

describe('the wallets, in each context', () => {
	it('has one wallet in Me, your own, which you may set', async () => {
		const own = await createTestSelfReward(db, ada);
		const solo = await testSoloSpace(db, ada.id);
		await setTestBalance(db, solo, ada, ada, 4);
		const list = await listFor(ada, solo);
		expect(walletsOf(list)).toEqual([
			{ spaceId: solo, userId: ada.id, mine: true, credits: 4, rewards: [own.id] }
		]);
		expect(list.wallets[0]?.canSet).toBe(true);
	});

	it('gives each side of a shared partnership its own wallet and the other’s it keeps', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const forAda = await createTestPartnershipReward(db, id, jun);
		const forJun = await createTestPartnershipReward(db, id, ada);
		await setTestBalance(db, id, jun, ada, 2);
		await setTestBalance(db, id, ada, jun, 7);

		const list = await listFor(ada, id);
		// Hers first — what she can spend — then Jun's, which she keeps rewards in.
		expect(walletsOf(list)).toEqual([
			{ spaceId: id, userId: ada.id, mine: true, credits: 2, rewards: [forAda.id] },
			{ spaceId: id, userId: jun.id, mine: false, credits: 7, rewards: [forJun.id] }
		]);
		// She cannot set her own credits there, only Jun's.
		expect(list.wallets.map((wallet: RewardWalletView) => wallet.canSet)).toEqual([false, true]);
		// Hers to claim (her 2 covers its 2), never to edit; Jun's to edit, never hers to claim.
		expect(list.wallets[0]?.rewards[0]).toMatchObject({ canClaim: true, canManage: false });
		expect(list.wallets[1]?.rewards[0]).toMatchObject({ canClaim: false, canManage: true });
	});

	it('shows the side that only sets rewards just the wallet it keeps', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		await createTestPartnershipReward(db, id, ada);
		expect(walletsOf(await listFor(ada, id)).map((wallet) => [wallet.userId, wallet.mine])).toEqual(
			[[jun.id, false]]
		);
		expect(walletsOf(await listFor(jun, id)).map((wallet) => [wallet.userId, wallet.mine])).toEqual(
			[[jun.id, true]]
		);
	});

	it('keeps every balance apart in Everyone', async () => {
		const withJun = (await createTestPartnership(db, ada, jun, { control: 'them' })).id;
		const withKit = (await createTestPartnership(db, kit, ada, { control: 'mix' })).id;
		const solo = await testSoloSpace(db, ada.id);
		const own = await createTestSelfReward(db, ada);
		const fromJun = await createTestPartnershipReward(db, withJun, jun);
		const forKit = await createTestPartnershipReward(db, withKit, ada);

		const list = await listFor(ada, 'all');
		expect(walletsOf(list)).toEqual([
			{ spaceId: solo, userId: ada.id, mine: true, credits: 0, rewards: [own.id] },
			{ spaceId: withJun, userId: ada.id, mine: true, credits: 0, rewards: [fromJun.id] },
			{ spaceId: withKit, userId: ada.id, mine: true, credits: 0, rewards: [] },
			{ spaceId: withKit, userId: kit.id, mine: false, credits: 0, rewards: [forKit.id] }
		]);
	});
});

describe('claim', () => {
	it('claims a reward set for you from your balance in its space', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const reward = await createTestPartnershipReward(db, id, ada, { cost: 3 });
		await setTestBalance(db, id, ada, jun, 5);

		const result = await run('claim', at(jun, { formData: { rewardId: reward.id } }) as never);
		expect(result).toMatchObject({ message: 'Reward claimed.' });
		await expect(readBalanceRow(db, id, jun.id)).resolves.toMatchObject({ credits: 2 });
		await expect(readRewardClaimRows(db, id)).resolves.toEqual([
			expect.objectContaining({ rewardId: reward.id, claimedByUserId: jun.id, rewardCost: 3 })
		]);
	});

	it('spends credits earned by completing a task the partner set, in the same wallet', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const task = await createTestPartnershipTask(db, id, ada, { creditsAwarded: 3 });
		const reward = await createTestPartnershipReward(db, id, ada, { cost: 3 });
		await completeTestTask(db, jun, task.id);
		// Not in Jun's own wallet: partnership credits buy that partnership's rewards.
		await expect(
			readBalanceRow(db, await testSoloSpace(db, jun.id), jun.id)
		).resolves.toBeUndefined();
		await run('claim', at(jun, { formData: { rewardId: reward.id } }) as never);
		await expect(readBalanceRow(db, id, jun.id)).resolves.toMatchObject({ credits: 0 });
	});

	it('refuses whoever set it, even under shared control', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const reward = await createTestPartnershipReward(db, id, ada, { cost: 0 });
		const result = await run('claim', at(ada, { formData: { rewardId: reward.id } }) as never);
		expect(result).toMatchObject({ status: 403 });
	});

	it('refuses a claim the balance does not cover', async () => {
		const reward = await createTestSelfReward(db, ada, { cost: 3 });
		const result = await run('claim', at(ada, { formData: { rewardId: reward.id } }) as never);
		expect(result).toMatchObject({ status: 400 });
	});

	it('404s a reward in a space you are not in', async () => {
		const reward = await createTestSelfReward(db, kit);
		await expect(
			runAndCatch(() => run('claim', at(ada, { formData: { rewardId: reward.id } }) as never))
		).resolves.toMatchObject({ type: 'error', status: 404 });
	});
});

describe('setCredits', () => {
	it('sets your own in your own space, and a partner’s where you manage', async () => {
		const solo = await testSoloSpace(db, ada.id);
		await run(
			'setCredits',
			at(ada, { formData: { spaceId: solo, targetUserId: ada.id, credits: '6' } }) as never
		);
		await expect(readBalanceRow(db, solo, ada.id)).resolves.toMatchObject({ credits: 6 });

		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		await run(
			'setCredits',
			at(ada, { formData: { spaceId: id, targetUserId: jun.id, credits: '9' } }) as never
		);
		await expect(readBalanceRow(db, id, jun.id)).resolves.toMatchObject({ credits: 9 });
	});

	it('refuses paying yourself in a partnership, and the side that does not manage', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const own = await run(
			'setCredits',
			at(ada, { formData: { spaceId: id, targetUserId: ada.id, credits: '9' } }) as never
		);
		expect(own).toMatchObject({ status: 403 });
		const juns = await run(
			'setCredits',
			at(jun, { formData: { spaceId: id, targetUserId: ada.id, credits: '9' } }) as never
		);
		expect(juns).toMatchObject({ status: 403 });
		await expect(readBalanceRow(db, id, ada.id)).resolves.toBeUndefined();
	});

	it('names the space it is about, never the context', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		await run(
			'setCredits',
			at(ada, {
				context: await testSoloSpace(db, ada.id),
				formData: { spaceId: id, targetUserId: jun.id, credits: '2' }
			}) as never
		);
		await expect(readBalanceRow(db, id, jun.id)).resolves.toMatchObject({ credits: 2 });
	});
});

describe('content', () => {
	it('saves a ticked description for whoever set the reward, and refuses whoever it is for', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const reward = await createTestPartnershipReward(db, id, ada);
		const post = {
			recordId: reward.id,
			vaultId: await ensureTestPartnershipVault(db, id),
			ciphertext: fakeSealed('ticked'),
			payloadVersion: '1',
			expectedRevision: '0'
		};
		expect(await run('content', at(jun, { formData: post }) as never)).toMatchObject({
			status: 403
		});
		expect(await run('content', at(ada, { formData: post }) as never)).toEqual({ saved: true });
		await expect(readRewardRow(db, reward.id)).resolves.toMatchObject({
			ciphertext: post.ciphertext,
			revision: 1
		});
	});
});
