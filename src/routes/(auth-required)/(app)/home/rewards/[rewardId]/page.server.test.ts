import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestSelfReward,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
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

/** An edit as the browser posts it, against the revision it opened. */
async function sealedPost(rewardId: string, overrides: Record<string, string> = {}) {
	return {
		recordId: rewardId,
		vaultId: await ensureTestSelfVault(db, ada.id),
		ciphertext: fakeSealed('edited'),
		payloadVersion: '1',
		cost: '3',
		active: 'on',
		expectedRevision: '0',
		...overrides
	};
}

describe('load', () => {
	it('loads one existing self reward with its sealed ref and revision', async () => {
		const reward = await createTestSelfReward(db, ada, { cost: 2 });
		await expect(runLoad(load(at(reward.id, ada)))).resolves.toMatchObject({
			reward: {
				id: reward.id,
				cost: 2,
				revision: 0,
				sealed: { recordId: reward.id, ciphertext: reward.ciphertext }
			}
		});
	});
});

describe('actions', () => {
	it('updates the reward, bumps its revision and redirects back to /home/rewards', async () => {
		const reward = await createTestSelfReward(db, ada, { cost: 2 });
		const post = await sealedPost(reward.id);
		const result = await runAndCatch(() => actions.default?.(at(reward.id, ada, post)));

		expect(result).toMatchObject({ type: 'redirect', status: 303, location: '/home/rewards' });
		await expect(readSelfRewardRow(db, reward.id)).resolves.toMatchObject({
			ciphertext: post.ciphertext,
			revision: 1,
			cost: 3
		});
	});

	it('refuses an edit against a stale revision with a 409', async () => {
		const reward = await createTestSelfReward(db, ada, { cost: 2 });
		// Someone else saved first: the row is now at revision 1.
		const first = await sealedPost(reward.id);
		await runAndCatch(() => actions.default?.(at(reward.id, ada, first)));

		const stale = await sealedPost(reward.id, { cost: '9' });
		const result = await runAndCatch(() => actions.default?.(at(reward.id, ada, stale)));
		expect(result).toMatchObject({
			type: 'ok',
			value: { status: 409, data: { error: expect.any(String) } }
		});
		await expect(readSelfRewardRow(db, reward.id)).resolves.toMatchObject({
			ciphertext: first.ciphertext,
			cost: 3,
			revision: 1
		});
	});

	it('refuses a post whose recordId is not the reward in the URL', async () => {
		const reward = await createTestSelfReward(db, ada, { cost: 2 });
		const other = await createTestSelfReward(db, ada, { cost: 5 });
		const post = await sealedPost(other.id);

		const result = await runAndCatch(() => actions.default?.(at(reward.id, ada, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 400 } });
		await expect(readSelfRewardRow(db, reward.id)).resolves.toMatchObject({
			ciphertext: reward.ciphertext
		});
		await expect(readSelfRewardRow(db, other.id)).resolves.toMatchObject({
			ciphertext: other.ciphertext
		});
	});

	it("refuses content sealed in a partnership's vault", async () => {
		const jun = await createTestUser(db, { name: 'Jun' });
		const { id } = await createTestPartnership(db, ada, jun);
		const reward = await createTestSelfReward(db, ada, { cost: 2 });
		const post = await sealedPost(reward.id, {
			vaultId: await ensureTestPartnershipVault(db, id)
		});

		const result = await runAndCatch(() => actions.default?.(at(reward.id, ada, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 409 } });
		await expect(readSelfRewardRow(db, reward.id)).resolves.toMatchObject({
			ciphertext: reward.ciphertext,
			revision: 0
		});
	});

	it('does not store a title the post still carries', async () => {
		const reward = await createTestSelfReward(db, ada, { cost: 2 });
		const post = await sealedPost(reward.id, { title: 'Bath time', description: 'Hot bath' });
		await runAndCatch(() => actions.default?.(at(reward.id, ada, post)));

		const row = await readSelfRewardRow(db, reward.id);
		expect(row).toMatchObject({
			ciphertext: post.ciphertext
		});
		// Only the sealed record is kept: there is nowhere for the text to go.
		expect(JSON.stringify(row)).not.toContain('Bath time');
	});

	it("404s for another user's reward", async () => {
		const jun = await createTestUser(db, { name: 'Jun' });
		const theirs = await createTestSelfReward(db, jun, { cost: 2 });
		const post = await sealedPost(theirs.id);

		const result = await runAndCatch(() => actions.default?.(at(theirs.id, ada, post)));
		expect(result).toMatchObject({ type: 'error', status: 404 });
		await expect(readSelfRewardRow(db, theirs.id)).resolves.toMatchObject({
			ciphertext: theirs.ciphertext
		});
	});
});
