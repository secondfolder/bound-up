import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestPartnershipReward,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readPartnershipRewardRow,
	type TestUser
} from '$lib/testing/fixtures';
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

const at = (
	id: string,
	rewardId: string,
	user: TestUser | null,
	formData?: Record<string, string>
) =>
	fakeEvent({
		db,
		user,
		params: { id, rewardId },
		formData,
		path: `/partner/${id}/rewards/${rewardId}`
	});

/** An edit as the browser posts it, against the revision it opened. */
async function sealedPost(
	partnershipId: string,
	rewardId: string,
	overrides: Record<string, string> = {}
) {
	return {
		recordId: rewardId,
		vaultId: await ensureTestPartnershipVault(db, partnershipId),
		ciphertext: fakeSealed('edited'),
		payloadVersion: '1',
		cost: '3',
		active: 'on',
		expectedRevision: '0',
		...overrides
	};
}

describe('load', () => {
	it('loads one existing partnership reward for the controlling side', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const reward = await createTestPartnershipReward(db, id, ada, { cost: 2 });
		await expect(runLoad(load(at(id, reward.id, ada)))).resolves.toMatchObject({
			partner: {
				id,
				names: expect.objectContaining({ partnershipId: id, role: 'inviter' }),
				canManageRewards: true
			},
			reward: {
				id: reward.id,
				cost: 2,
				revision: 0,
				sealed: { recordId: reward.id, ciphertext: reward.ciphertext }
			}
		});
	});

	it('403s for the non-controlling side', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const reward = await createTestPartnershipReward(db, id, ada, { cost: 2 });
		const result = await runAndCatch(() => runLoad(load(at(id, reward.id, jun))));
		expect(result).toMatchObject({ type: 'error', status: 403 });
	});
});

describe('actions', () => {
	it('updates the reward and redirects back to the partnership rewards page', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const reward = await createTestPartnershipReward(db, id, ada, { cost: 2 });
		const post = await sealedPost(id, reward.id);
		const result = await runAndCatch(() => actions.default?.(at(id, reward.id, ada, post)));

		expect(result).toMatchObject({
			type: 'redirect',
			status: 303,
			location: `/partner/${id}/rewards`
		});
		await expect(readPartnershipRewardRow(db, reward.id)).resolves.toMatchObject({
			ciphertext: post.ciphertext,
			revision: 1,
			cost: 3
		});
	});

	it('refuses an edit against a stale revision with a 409', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const reward = await createTestPartnershipReward(db, id, ada, { cost: 2 });
		const first = await sealedPost(id, reward.id);
		await runAndCatch(() => actions.default?.(at(id, reward.id, ada, first)));

		const stale = await sealedPost(id, reward.id, { cost: '9' });
		const result = await runAndCatch(() => actions.default?.(at(id, reward.id, ada, stale)));
		expect(result).toMatchObject({
			type: 'ok',
			value: { status: 409, data: { error: expect.any(String) } }
		});
		await expect(readPartnershipRewardRow(db, reward.id)).resolves.toMatchObject({
			ciphertext: first.ciphertext,
			cost: 3,
			revision: 1
		});
	});

	it('refuses a post whose recordId is not the reward in the URL', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const reward = await createTestPartnershipReward(db, id, ada, { cost: 2 });
		const other = await createTestPartnershipReward(db, id, ada, { cost: 5 });
		const post = await sealedPost(id, other.id);

		const result = await runAndCatch(() => actions.default?.(at(id, reward.id, ada, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 400 } });
		await expect(readPartnershipRewardRow(db, reward.id)).resolves.toMatchObject({
			ciphertext: reward.ciphertext
		});
		await expect(readPartnershipRewardRow(db, other.id)).resolves.toMatchObject({
			ciphertext: other.ciphertext
		});
	});

	it("refuses content sealed in another scope's vault", async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const reward = await createTestPartnershipReward(db, id, ada, { cost: 2 });
		const post = await sealedPost(id, reward.id, {
			vaultId: await ensureTestSelfVault(db, ada.id)
		});

		const result = await runAndCatch(() => actions.default?.(at(id, reward.id, ada, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 409 } });
		await expect(readPartnershipRewardRow(db, reward.id)).resolves.toMatchObject({
			ciphertext: reward.ciphertext,
			revision: 0
		});
	});

	it('does not store a title the post still carries', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const reward = await createTestPartnershipReward(db, id, ada, { cost: 2 });
		const post = await sealedPost(id, reward.id, { title: 'Tea time', description: 'Fresh pot' });
		await runAndCatch(() => actions.default?.(at(id, reward.id, ada, post)));

		await expect(readPartnershipRewardRow(db, reward.id)).resolves.toMatchObject({
			title: '',
			description: null,
			ciphertext: post.ciphertext
		});
	});

	it('refuses the non-controlling side', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const reward = await createTestPartnershipReward(db, id, ada, { cost: 2 });
		const post = await sealedPost(id, reward.id);

		const result = await runAndCatch(() => actions.default?.(at(id, reward.id, jun, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 403 } });
		await expect(readPartnershipRewardRow(db, reward.id)).resolves.toMatchObject({
			ciphertext: reward.ciphertext
		});
	});
});
