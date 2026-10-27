import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RewardInput } from '../rewards';
import { createTestDb, type TestDb } from '../testing/db';
import { defined } from '../testing/defined';
import {
	claimTestReward,
	createTestInvite,
	createTestPartnership,
	createTestReward,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readBalanceRow,
	readRewardClaimRows,
	readRewardRow,
	setTestBalance,
	setTestPartnershipControl,
	type TestUser,
	testSoloSpace
} from '../testing/fixtures';
import { testPartnerView } from '../testing/names';
import {
	claimReward,
	createReward,
	getRewardForViewer,
	getRewardsWidget,
	listRewardClaims,
	listRewards,
	setRewardBalance,
	updateReward,
	updateRewardContent
} from './rewards';

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;
/** Ada's solo space, which every account has from the moment it exists. */
let adaSolo: string;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	jun = await createTestUser(harness.db, { name: 'Jun' });
	adaSolo = await testSoloSpace(harness.db, ada.id);
});

afterEach(() => harness.close());

/** A whole reward write, sealed under `vaultId`, as the editor posts it. */
function rewardInput(
	vaultId: string,
	overrides: { cost?: number; active?: boolean; ciphertext?: string; payloadVersion?: number } = {}
): RewardInput {
	return {
		cost: overrides.cost ?? 1,
		active: overrides.active ?? true,
		content: {
			vaultId,
			ciphertext: overrides.ciphertext ?? fakeSealed('reward'),
			payloadVersion: overrides.payloadVersion ?? 1
		}
	};
}

/**
 * A partnership between Ada (the inviter) and `invitee`. The control answer
 * is Ada's, as the invite form asks it: `me` is Ada alone, `them` the invitee
 * alone, `mix` both — which is stored as control `both`.
 */
async function partnership(
	control: 'me' | 'them' | 'mix',
	invitee: TestUser = jun
): Promise<string> {
	return (await createTestPartnership(harness.db, ada, invitee, { control })).id;
}

const byText = (a: string, b: string) => a.localeCompare(b);
const ids = (list: { id: string }[]) => list.map((item) => item.id).sort(byText);

describe('a solo space', () => {
	it('lists, claims, and deducts credits from a reward', async () => {
		const { id, ciphertext } = await createTestReward(harness.db, adaSolo, ada, { cost: 4 });
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		await setTestBalance(harness.db, adaSolo, ada, ada, 6);

		await expect(readRewardRow(harness.db, id)).resolves.toMatchObject({
			spaceId: adaSolo,
			createdByUserId: ada.id,
			assigneeUserId: ada.id
		});
		const before = await listRewards(harness.db, ada.id, [adaSolo]);
		expect(before.spaces).toEqual([
			{ id: adaSolo, kind: 'solo', canManage: true, viewerActs: true, others: [] }
		]);
		expect(before.wallets).toEqual([
			{
				spaceId: adaSolo,
				userId: ada.id,
				mine: true,
				credits: 6,
				canSet: true,
				rewards: [
					expect.objectContaining({
						id,
						sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 },
						revision: 0,
						createdByMe: true,
						canManage: true,
						canClaim: true
					})
				]
			}
		]);

		await expect(claimReward(harness.db, ada.id, id)).resolves.toEqual({ ok: true });
		await expect(readBalanceRow(harness.db, adaSolo, ada.id)).resolves.toMatchObject({
			credits: 2
		});
		await expect(readRewardClaimRows(harness.db, adaSolo)).resolves.toContainEqual(
			expect.objectContaining({ rewardId: id, rewardCost: 4, claimedByUserId: ada.id })
		);
	});

	it('hands back the sealed record, and nothing in its place', async () => {
		const { id, ciphertext } = await createTestReward(harness.db, adaSolo, ada);

		const found = defined(await getRewardForViewer(harness.db, ada.id, id), 'reward');
		expect(found.reward.sealed).toMatchObject({ recordId: id, ciphertext });
		expect(found.space).toMatchObject({ id: adaSolo, kind: 'solo' });
		for (const plaintext of ['title', 'description']) {
			expect(found.reward).not.toHaveProperty(plaintext);
		}
	});

	it('snapshots the sealed reward at claim time, not as later edited', async () => {
		const { id, ciphertext } = await createTestReward(harness.db, adaSolo, ada, { cost: 1 });
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		await setTestBalance(harness.db, adaSolo, ada, ada, 1);

		await expect(claimReward(harness.db, ada.id, id)).resolves.toEqual({ ok: true });
		await expect(
			updateReward(harness.db, ada.id, id, {
				...rewardInput(vaultId, { ciphertext: fakeSealed('edited') }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: true });

		const [claim] = await readRewardClaimRows(harness.db, adaSolo);
		expect(defined(claim, 'claim row')).toMatchObject({
			snapshotCiphertext: ciphertext,
			snapshotVaultId: vaultId,
			snapshotVersion: 1,
			snapshotRecordId: id
		});
		await expect(listRewardClaims(harness.db, ada.id, [adaSolo])).resolves.toEqual([
			expect.objectContaining({
				spaceId: adaSolo,
				rewardCost: 1,
				mine: true,
				createdByMe: true,
				sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 }
			})
		]);
	});

	it('refuses an inactive reward', async () => {
		const { id } = await createTestReward(harness.db, adaSolo, ada, { active: false });
		await setTestBalance(harness.db, adaSolo, ada, ada, 10);

		await expect(claimReward(harness.db, ada.id, id)).resolves.toEqual({
			ok: false,
			reason: 'inactive'
		});
		await expect(readRewardClaimRows(harness.db, adaSolo)).resolves.toEqual([]);
	});

	it('refuses a reward the balance does not cover, and takes nothing', async () => {
		const { id } = await createTestReward(harness.db, adaSolo, ada, { cost: 5 });
		await setTestBalance(harness.db, adaSolo, ada, ada, 4);

		await expect(claimReward(harness.db, ada.id, id)).resolves.toEqual({
			ok: false,
			reason: 'insufficient-credits'
		});
		await expect(readBalanceRow(harness.db, adaSolo, ada.id)).resolves.toMatchObject({
			credits: 4
		});
		await expect(readRewardClaimRows(harness.db, adaSolo)).resolves.toEqual([]);
	});

	it("refuses someone else's solo space and reward as not theirs at all", async () => {
		const junSolo = await testSoloSpace(harness.db, jun.id);
		const { id } = await createTestReward(harness.db, junSolo, jun);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);

		await expect(
			createReward(harness.db, ada.id, junSolo, crypto.randomUUID(), rewardInput(vaultId))
		).resolves.toEqual({ ok: false, reason: 'not-a-member' });
		// not-found, not forbidden or conflict: nothing says the reward exists.
		await expect(
			updateReward(harness.db, ada.id, id, { ...rewardInput(vaultId), expectedRevision: 0 })
		).resolves.toEqual({ ok: false, reason: 'not-found' });
		await expect(claimReward(harness.db, ada.id, id)).resolves.toEqual({
			ok: false,
			reason: 'not-found'
		});
		await expect(getRewardForViewer(harness.db, ada.id, id)).resolves.toBeNull();
	});
});

describe('reward writes', () => {
	it('refuses a create naming an id that is already taken, and changes nothing', async () => {
		const { id, ciphertext } = await createTestReward(harness.db, adaSolo, ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);

		await expect(
			createReward(harness.db, ada.id, adaSolo, id, rewardInput(vaultId))
		).resolves.toEqual({ ok: false, reason: 'id-taken' });
		await expect(readRewardRow(harness.db, id)).resolves.toMatchObject({ ciphertext });
	});

	it('bumps the revision on an update made at the current revision', async () => {
		const { id } = await createTestReward(harness.db, adaSolo, ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const ciphertext = fakeSealed('v1');

		await expect(
			updateReward(harness.db, ada.id, id, {
				...rewardInput(vaultId, { ciphertext, cost: 9 }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: true });
		await expect(readRewardRow(harness.db, id)).resolves.toMatchObject({
			revision: 1,
			ciphertext,
			cost: 9
		});
	});

	it('refuses an update made at a stale revision, and keeps the newer content', async () => {
		const { id } = await createTestReward(harness.db, adaSolo, ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const newer = fakeSealed('newer');

		await updateReward(harness.db, ada.id, id, {
			...rewardInput(vaultId, { ciphertext: newer }),
			expectedRevision: 0
		});
		await expect(
			updateReward(harness.db, ada.id, id, {
				...rewardInput(vaultId, { ciphertext: fakeSealed('stale') }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'conflict' });
		await expect(readRewardRow(harness.db, id)).resolves.toMatchObject({
			revision: 1,
			ciphertext: newer
		});
	});

	it('replaces only the content on a content write, so a tick cannot carry a stale cost', async () => {
		const { id } = await createTestReward(harness.db, adaSolo, ada, { cost: 3 });
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const ciphertext = fakeSealed('ticked');

		await expect(
			updateRewardContent(harness.db, ada.id, id, {
				content: rewardInput(vaultId, { ciphertext }).content,
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: true });
		await expect(readRewardRow(harness.db, id)).resolves.toMatchObject({
			ciphertext,
			revision: 1,
			cost: 3,
			active: true
		});
		await expect(
			updateRewardContent(harness.db, ada.id, id, {
				content: rewardInput(vaultId).content,
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'conflict' });
	});

	it("refuses content sealed under another space's vault, in either kind of space", async () => {
		const shared = await partnership('mix');
		const cas = await createTestUser(harness.db, { name: 'Cas' });
		const other = await partnership('mix', cas);
		const sharedVault = await ensureTestPartnershipVault(harness.db, shared);
		const otherVault = await ensureTestPartnershipVault(harness.db, other);
		const junsVault = await ensureTestSelfVault(harness.db, jun.id);
		const adasVault = await ensureTestSelfVault(harness.db, ada.id);

		for (const [spaceId, vaultId] of [
			[adaSolo, sharedVault],
			[adaSolo, junsVault],
			[shared, otherVault],
			[shared, adasVault]
		] as const) {
			await expect(
				createReward(harness.db, ada.id, spaceId, crypto.randomUUID(), rewardInput(vaultId))
			).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
		}

		const solo = await createTestReward(harness.db, adaSolo, ada);
		await expect(
			updateReward(harness.db, ada.id, solo.id, {
				...rewardInput(sharedVault),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
		await expect(readRewardRow(harness.db, solo.id)).resolves.toMatchObject({
			ciphertext: solo.ciphertext
		});

		const set = await createTestReward(harness.db, shared, ada);
		await expect(
			updateRewardContent(harness.db, ada.id, set.id, {
				content: rewardInput(otherVault).content,
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
		await expect(readRewardRow(harness.db, set.id)).resolves.toMatchObject({
			ciphertext: set.ciphertext
		});
	});

	it('refuses a write while the space has no vault at all', async () => {
		await expect(
			createReward(
				harness.db,
				ada.id,
				adaSolo,
				crypto.randomUUID(),
				rewardInput(crypto.randomUUID())
			)
		).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
	});

	it.each([
		['an empty ciphertext', { ciphertext: '' }],
		['a ciphertext not in the sealed format', { ciphertext: 'not sealed at all' }],
		['a ciphertext over the cap', { ciphertext: `sb1.${'A'.repeat(32 * 1024)}` }],
		['an unknown payload version', { payloadVersion: 99 }]
	])('refuses %s', async (_label, overrides) => {
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const id = crypto.randomUUID();

		await expect(
			createReward(harness.db, ada.id, adaSolo, id, rewardInput(vaultId, overrides))
		).resolves.toEqual({ ok: false, reason: 'bad-content' });
		await expect(readRewardRow(harness.db, id)).resolves.toBeUndefined();
	});

	it('refuses a malformed ciphertext in a shared space too', async () => {
		const shared = await partnership('mix');
		const vaultId = await ensureTestPartnershipVault(harness.db, shared);

		await expect(
			createReward(
				harness.db,
				ada.id,
				shared,
				crypto.randomUUID(),
				rewardInput(vaultId, { ciphertext: 'plain title' })
			)
		).resolves.toEqual({ ok: false, reason: 'bad-content' });
	});
});

describe('a shared space', () => {
	it('lets the manager create rewards for the other member, and not the other way', async () => {
		const shared = await partnership('me');
		const vaultId = await ensureTestPartnershipVault(harness.db, shared);
		const id = crypto.randomUUID();
		const ciphertext = fakeSealed('partner');

		await expect(
			createReward(harness.db, ada.id, shared, id, rewardInput(vaultId, { ciphertext, cost: 3 }))
		).resolves.toEqual({ ok: true, id });
		await expect(readRewardRow(harness.db, id)).resolves.toMatchObject({
			spaceId: shared,
			createdByUserId: ada.id,
			// The authorship rule: never the creator, so the other member.
			assigneeUserId: jun.id,
			ciphertext,
			vaultId,
			revision: 0
		});

		await expect(
			createReward(harness.db, jun.id, shared, crypto.randomUUID(), rewardInput(vaultId))
		).resolves.toEqual({ ok: false, reason: 'forbidden' });
	});

	it('refuses a non-member, and a pending invite that has no space to write in yet', async () => {
		const shared = await partnership('mix');
		const vaultId = await ensureTestPartnershipVault(harness.db, shared);
		const { id } = await createTestReward(harness.db, shared, ada);
		const stranger = await createTestUser(harness.db, { name: 'Stranger' });

		await expect(
			createReward(harness.db, stranger.id, shared, crypto.randomUUID(), rewardInput(vaultId))
		).resolves.toEqual({ ok: false, reason: 'not-a-member' });
		await expect(
			updateReward(harness.db, stranger.id, id, { ...rewardInput(vaultId), expectedRevision: 0 })
		).resolves.toEqual({ ok: false, reason: 'not-found' });
		await expect(claimReward(harness.db, stranger.id, id)).resolves.toEqual({
			ok: false,
			reason: 'not-found'
		});
		await expect(setRewardBalance(harness.db, stranger.id, shared, jun.id, 5)).resolves.toEqual({
			ok: false,
			reason: 'not-a-member'
		});
		await expect(getRewardForViewer(harness.db, stranger.id, id)).resolves.toBeNull();

		const invite = await createTestInvite(harness.db, ada);
		await expect(
			createReward(harness.db, ada.id, invite.id, crypto.randomUUID(), rewardInput(vaultId))
		).resolves.toEqual({ ok: false, reason: 'not-a-member' });
		await expect(listRewards(harness.db, ada.id, [invite.id])).resolves.toEqual({
			spaces: [],
			wallets: []
		});
	});

	it("lets the member it is set for claim the other's reward, from their balance there", async () => {
		const shared = await partnership('them');
		const { id } = await createTestReward(harness.db, shared, jun, { cost: 2 });
		await setTestBalance(harness.db, shared, jun, ada, 4);

		await expect(claimReward(harness.db, ada.id, id)).resolves.toEqual({ ok: true });
		await expect(readBalanceRow(harness.db, shared, ada.id)).resolves.toMatchObject({
			credits: 2
		});
		await expect(readRewardClaimRows(harness.db, shared)).resolves.toContainEqual(
			expect.objectContaining({ rewardId: id, claimedByUserId: ada.id, createdByUserId: jun.id })
		);
	});

	it("snapshots the author's sealed reward when the other member claims it", async () => {
		const shared = await partnership('them');
		const vaultId = await ensureTestPartnershipVault(harness.db, shared);
		const { id, ciphertext } = await createTestReward(harness.db, shared, jun, { cost: 1 });
		await setTestBalance(harness.db, shared, jun, ada, 1);

		await claimTestReward(harness.db, ada, id);

		const [claim] = await readRewardClaimRows(harness.db, shared);
		expect(defined(claim, 'claim row')).toMatchObject({
			snapshotCiphertext: ciphertext,
			snapshotVaultId: vaultId,
			snapshotVersion: 1,
			snapshotRecordId: id
		});
		await expect(listRewardClaims(harness.db, ada.id, [shared])).resolves.toEqual([
			expect.objectContaining({
				mine: true,
				createdByMe: false,
				sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 }
			})
		]);
		await expect(listRewardClaims(harness.db, jun.id, [shared])).resolves.toEqual([
			expect.objectContaining({ mine: false, createdByMe: true })
		]);
	});

	it('lets only the setter edit, never the member it is set for', async () => {
		const shared = await partnership('mix');
		const vaultId = await ensureTestPartnershipVault(harness.db, shared);
		const { id } = await createTestReward(harness.db, shared, ada);
		const newer = fakeSealed('newer');

		await expect(
			updateReward(harness.db, ada.id, id, {
				...rewardInput(vaultId, { ciphertext: newer }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: true });
		await expect(
			updateReward(harness.db, ada.id, id, {
				...rewardInput(vaultId, { ciphertext: fakeSealed('stale') }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'conflict' });
		// Jun manages the space too, but the reward is his to claim: editing it
		// would let him set his own price.
		await expect(
			updateReward(harness.db, jun.id, id, {
				...rewardInput(vaultId, { cost: 0 }),
				expectedRevision: 1
			})
		).resolves.toEqual({ ok: false, reason: 'forbidden' });
		await expect(
			updateRewardContent(harness.db, jun.id, id, {
				content: rewardInput(vaultId).content,
				expectedRevision: 1
			})
		).resolves.toEqual({ ok: false, reason: 'forbidden' });

		await expect(readRewardRow(harness.db, id)).resolves.toMatchObject({
			revision: 1,
			ciphertext: newer
		});
	});

	it('refuses the author claiming their own reward under shared control', async () => {
		const shared = await partnership('mix');
		const { id } = await createTestReward(harness.db, shared, ada, { cost: 2 });
		// Jun can give Ada credits, so it is the authorship rule that refuses, not the balance.
		await setTestBalance(harness.db, shared, jun, ada, 3);
		await setTestBalance(harness.db, shared, ada, jun, 3);

		await expect(claimReward(harness.db, ada.id, id)).resolves.toEqual({
			ok: false,
			reason: 'not-allowed'
		});

		await claimTestReward(harness.db, jun, id);
		await expect(readRewardClaimRows(harness.db, shared)).resolves.toEqual([
			expect.objectContaining({ rewardId: id, claimedByUserId: jun.id })
		]);
	});

	it('uses who manages now to decide claimability, not authorship alone', async () => {
		const shared = await partnership('mix');
		const { id } = await createTestReward(harness.db, shared, jun, { cost: 2 });
		await setTestBalance(harness.db, shared, jun, ada, 3);

		await setTestPartnershipControl(harness.db, shared, 'inviter');

		await expect(claimReward(harness.db, ada.id, id)).resolves.toEqual({
			ok: false,
			reason: 'not-allowed'
		});
		// Hidden, not deleted: it is on nobody's list until control changes back.
		await expect(readRewardRow(harness.db, id)).resolves.toBeTruthy();
		const adas = await listRewards(harness.db, ada.id, [shared]);
		expect(adas.wallets.flatMap((wallet) => wallet.rewards)).toEqual([]);

		await setTestPartnershipControl(harness.db, shared, 'both');
		await expect(claimReward(harness.db, ada.id, id)).resolves.toEqual({ ok: true });
	});

	it("returns the claiming side's wallet with each reward priced against it", async () => {
		const shared = await partnership('them');
		const { id } = await createTestReward(harness.db, shared, jun, { cost: 5 });
		await setTestBalance(harness.db, shared, jun, ada, 4);

		const list = await listRewards(harness.db, ada.id, [shared]);
		expect(list.spaces).toEqual([
			{
				id: shared,
				kind: 'shared',
				canManage: false,
				viewerActs: true,
				others: [{ userId: jun.id, timezone: jun.timezone }]
			}
		]);
		expect(list.wallets).toEqual([
			{
				spaceId: shared,
				userId: ada.id,
				mine: true,
				credits: 4,
				// Ada cannot pay herself: only Jun sets her balance here.
				canSet: false,
				rewards: [
					expect.objectContaining({
						id,
						createdByMe: false,
						canManage: false,
						canClaim: false
					})
				]
			}
		]);
	});
});

describe('wallets', () => {
	it("gives the managing side its partner's wallet, and no wallet of its own", async () => {
		const shared = await partnership('me');
		const { id } = await createTestReward(harness.db, shared, ada, { cost: 2 });
		await setTestBalance(harness.db, shared, ada, jun, 7);

		const list = await listRewards(harness.db, ada.id, [shared]);
		expect(list.wallets).toEqual([
			{
				spaceId: shared,
				userId: jun.id,
				mine: false,
				credits: 7,
				canSet: true,
				rewards: [expect.objectContaining({ id, createdByMe: true, canManage: true })]
			}
		]);
	});

	it('under shared control, puts each reward in the wallet of the member it is for', async () => {
		const shared = await partnership('mix');
		const forAda = await createTestReward(harness.db, shared, jun);
		const forJun = await createTestReward(harness.db, shared, ada);
		await setTestBalance(harness.db, shared, jun, ada, 1);
		await setTestBalance(harness.db, shared, ada, jun, 2);

		const list = await listRewards(harness.db, ada.id, [shared]);
		expect(list.wallets).toEqual([
			expect.objectContaining({
				userId: ada.id,
				mine: true,
				credits: 1,
				canSet: false,
				rewards: [expect.objectContaining({ id: forAda.id })]
			}),
			expect.objectContaining({
				userId: jun.id,
				mine: false,
				credits: 2,
				canSet: true,
				rewards: [expect.objectContaining({ id: forJun.id })]
			})
		]);
	});

	it("lists the viewer's own wallets first, then the partners they manage, never pooled", async () => {
		const cas = await createTestUser(harness.db, { name: 'Cas' });
		const pat = await createTestUser(harness.db, { name: 'Pat' });
		const forCas = await partnership('me', cas); // Ada sets for Cas
		const withJun = await partnership('them'); // Jun sets for Ada
		const withPat = await partnership('mix', pat); // both ways
		// A space Ada is not in, named anyway: left out, not an error.
		const notAdas = (await createTestPartnership(harness.db, jun, cas)).id;

		const own = await createTestReward(harness.db, adaSolo, ada, { cost: 1 });
		const casReward = await createTestReward(harness.db, forCas, ada, { cost: 1 });
		const junReward = await createTestReward(harness.db, withJun, jun, { cost: 3 });
		const patReward = await createTestReward(harness.db, withPat, pat, { cost: 1 });
		const forPat = await createTestReward(harness.db, withPat, ada, { cost: 1 });
		await createTestReward(harness.db, notAdas, jun);

		await setTestBalance(harness.db, adaSolo, ada, ada, 5);
		await setTestBalance(harness.db, forCas, ada, cas, 6);
		await setTestBalance(harness.db, withJun, jun, ada, 2);
		await setTestBalance(harness.db, withPat, pat, ada, 1);
		await setTestBalance(harness.db, withPat, ada, pat, 8);

		const list = await listRewards(harness.db, ada.id, [
			adaSolo,
			forCas,
			withJun,
			notAdas,
			withPat
		]);

		expect(list.spaces.map((space) => space.id)).toEqual([adaSolo, forCas, withJun, withPat]);
		expect(
			list.wallets.map((wallet) => ({
				spaceId: wallet.spaceId,
				userId: wallet.userId,
				mine: wallet.mine,
				credits: wallet.credits,
				rewards: ids(wallet.rewards)
			}))
		).toEqual([
			{ spaceId: adaSolo, userId: ada.id, mine: true, credits: 5, rewards: [own.id] },
			{ spaceId: withJun, userId: ada.id, mine: true, credits: 2, rewards: [junReward.id] },
			{ spaceId: withPat, userId: ada.id, mine: true, credits: 1, rewards: [patReward.id] },
			{ spaceId: forCas, userId: cas.id, mine: false, credits: 6, rewards: [casReward.id] },
			{ spaceId: withPat, userId: pat.id, mine: false, credits: 8, rewards: [forPat.id] }
		]);

		// Five solo credits would cover Jun's three-credit reward if they pooled;
		// they do not, so the two Ada holds with Jun do not.
		const junWallet = defined(
			list.wallets.find((wallet) => wallet.spaceId === withJun),
			"Ada's wallet with Jun"
		);
		expect(junWallet.rewards).toEqual([expect.objectContaining({ canClaim: false })]);
		await expect(claimReward(harness.db, ada.id, junReward.id)).resolves.toEqual({
			ok: false,
			reason: 'insufficient-credits'
		});
	});

	it('lists claims from every space named, and none from one the viewer is not in', async () => {
		const withJun = await partnership('them');
		const cas = await createTestUser(harness.db, { name: 'Cas' });
		const notAdas = (await createTestPartnership(harness.db, jun, cas, { control: 'me' })).id;
		const own = await createTestReward(harness.db, adaSolo, ada, { cost: 1 });
		const fromJun = await createTestReward(harness.db, withJun, jun, { cost: 1 });
		const forCas = await createTestReward(harness.db, notAdas, jun, { cost: 1 });
		await setTestBalance(harness.db, adaSolo, ada, ada, 1);
		await setTestBalance(harness.db, withJun, jun, ada, 1);
		await setTestBalance(harness.db, notAdas, jun, cas, 1);
		await claimTestReward(harness.db, ada, own.id);
		await claimTestReward(harness.db, ada, fromJun.id);
		await claimTestReward(harness.db, cas, forCas.id);

		const history = await listRewardClaims(harness.db, ada.id, [adaSolo, withJun, notAdas]);
		expect(history.map((row) => row.spaceId).sort(byText)).toEqual([adaSolo, withJun].sort(byText));
		await expect(listRewardClaims(harness.db, ada.id, [notAdas])).resolves.toEqual([]);
	});
});

describe('setRewardBalance', () => {
	it('lets the owner set their own balance in their own space, and nobody else', async () => {
		await expect(setRewardBalance(harness.db, ada.id, adaSolo, ada.id, 5)).resolves.toEqual({
			ok: true
		});
		await expect(readBalanceRow(harness.db, adaSolo, ada.id)).resolves.toMatchObject({
			credits: 5
		});
		// Setting it again replaces it: one row per space and member.
		await expect(setRewardBalance(harness.db, ada.id, adaSolo, ada.id, 2)).resolves.toEqual({
			ok: true
		});
		await expect(readBalanceRow(harness.db, adaSolo, ada.id)).resolves.toMatchObject({
			credits: 2
		});

		// Jun is not in Ada's solo space; Ada cannot plant a balance for Jun in it.
		await expect(setRewardBalance(harness.db, jun.id, adaSolo, ada.id, 99)).resolves.toEqual({
			ok: false,
			reason: 'not-a-member'
		});
		await expect(setRewardBalance(harness.db, ada.id, adaSolo, jun.id, 99)).resolves.toEqual({
			ok: false,
			reason: 'forbidden'
		});
		await expect(readBalanceRow(harness.db, adaSolo, jun.id)).resolves.toBeUndefined();
	});

	it("lets the manager set the other member's balance, never their own", async () => {
		const shared = await partnership('me');

		await expect(setRewardBalance(harness.db, ada.id, shared, jun.id, 5)).resolves.toEqual({
			ok: true
		});
		await expect(readBalanceRow(harness.db, shared, jun.id)).resolves.toMatchObject({
			credits: 5
		});
		// Paying herself.
		await expect(setRewardBalance(harness.db, ada.id, shared, ada.id, 5)).resolves.toEqual({
			ok: false,
			reason: 'forbidden'
		});
		// Jun does not manage, so he can set nobody's — least of all his own.
		for (const target of [ada, jun]) {
			await expect(setRewardBalance(harness.db, jun.id, shared, target.id, 50)).resolves.toEqual({
				ok: false,
				reason: 'forbidden'
			});
		}
		await expect(readBalanceRow(harness.db, shared, ada.id)).resolves.toBeUndefined();
		await expect(readBalanceRow(harness.db, shared, jun.id)).resolves.toMatchObject({
			credits: 5
		});
	});

	it("under shared control, each sets the other's balance and neither their own", async () => {
		const shared = await partnership('mix');

		await expect(setRewardBalance(harness.db, ada.id, shared, jun.id, 3)).resolves.toEqual({
			ok: true
		});
		await expect(setRewardBalance(harness.db, jun.id, shared, ada.id, 4)).resolves.toEqual({
			ok: true
		});
		for (const viewer of [ada, jun]) {
			await expect(setRewardBalance(harness.db, viewer.id, shared, viewer.id, 99)).resolves.toEqual(
				{ ok: false, reason: 'forbidden' }
			);
		}
	});

	it('refuses a target who is not in the space', async () => {
		const shared = await partnership('me');
		const stranger = await createTestUser(harness.db, { name: 'Stranger' });

		await expect(setRewardBalance(harness.db, ada.id, shared, stranger.id, 5)).resolves.toEqual({
			ok: false,
			reason: 'forbidden'
		});
		await expect(readBalanceRow(harness.db, shared, stranger.id)).resolves.toBeUndefined();
	});
});

describe('the rewards widget', () => {
	it('splits affordable from out of reach against the current balance', async () => {
		await setTestBalance(harness.db, adaSolo, ada, ada, 5);
		const affordable = await createTestReward(harness.db, adaSolo, ada, { cost: 5 });
		await createTestReward(harness.db, adaSolo, ada, { cost: 6 });
		await createTestReward(harness.db, adaSolo, ada, { cost: 1, active: false });

		const widget = await getRewardsWidget(harness.db, ada.id, [adaSolo], new Map());
		expect(widget).toMatchObject({
			viewerActs: true,
			balances: [{ id: adaSolo, label: null, credits: 5 }],
			// Cost equal to the balance is affordable, matching `claimReward`'s
			// own `credits >= cost`. An off-by-one here would offer a claim the
			// claim path then refuses.
			claimable: [{ id: affordable.id, note: '5', context: null }],
			claimableCount: 1,
			activeCount: 2
		});
	});

	it('carries each row as a sealed ref, with no plaintext title', async () => {
		await setTestBalance(harness.db, adaSolo, ada, ada, 5);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const { id, ciphertext } = await createTestReward(harness.db, adaSolo, ada, { cost: 2 });

		const widget = await getRewardsWidget(harness.db, ada.id, [adaSolo], new Map());
		expect(widget.claimable).toEqual([
			{
				id,
				title: '',
				kind: 'reward',
				sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 },
				note: '2',
				context: null
			}
		]);
	});

	it('omits your own reward from your claimable list even under shared control', async () => {
		const shared = await partnership('mix');
		await createTestReward(harness.db, shared, ada, { cost: 1 });
		const juns = await createTestReward(harness.db, shared, jun, { cost: 1 });
		// Jun sets Ada's balance, not Ada herself: nobody sets their own in a shared space.
		await setTestBalance(harness.db, shared, jun, ada, 10);

		const widget = await getRewardsWidget(harness.db, ada.id, [shared], new Map());
		expect(widget).toMatchObject({
			viewerActs: true,
			claimable: [
				{ id: juns.id, sealed: expect.objectContaining({ ciphertext: juns.ciphertext }) }
			],
			claimableCount: 1,
			activeCount: 1
		});
	});

	it('shows the managing side a count of what it set, and no claim list', async () => {
		const shared = await partnership('me');
		await createTestReward(harness.db, shared, ada);

		await expect(getRewardsWidget(harness.db, ada.id, [shared], new Map())).resolves.toEqual({
			viewerActs: false,
			balances: [],
			claimable: [],
			claimableCount: 0,
			activeCount: 1
		});
	});

	it('is the empty view for someone who is not in the space', async () => {
		const stranger = await createTestUser(harness.db);
		const shared = await partnership('mix');
		await createTestReward(harness.db, shared, ada);

		await expect(getRewardsWidget(harness.db, stranger.id, [shared], new Map())).resolves.toEqual({
			viewerActs: true,
			balances: [],
			claimable: [],
			claimableCount: 0,
			activeCount: 0
		});
	});

	/** The rewards half of the same bug: the Everyone card showed solo rewards only. */
	it('merges rewards you can claim in a shared space with your own, naming whose is whose', async () => {
		const shared = await partnership('them');
		await setTestBalance(harness.db, adaSolo, ada, ada, 5);
		const own = await createTestReward(harness.db, adaSolo, ada, { cost: 5 });
		const juns = await createTestReward(harness.db, shared, jun, { cost: 2 });
		await setTestBalance(harness.db, shared, jun, ada, 2);
		const names = new Map([[shared, testPartnerView(shared, 'Jun').names]]);

		const widget = await getRewardsWidget(harness.db, ada.id, [adaSolo, shared], names);
		expect(widget.activeCount).toBe(2);
		expect(widget.claimable).toEqual([
			// Cheapest first across every space, not solo first.
			expect.objectContaining({ id: juns.id, context: names.get(shared) }),
			expect.objectContaining({ id: own.id, context: null })
		]);
	});

	/**
	 * Credits do not pool, and this is what goes wrong if they are summed: 5
	 * solo credits plus 2 shared credits would "afford" a 6-credit shared
	 * reward the claim path then refuses.
	 */
	it('prices each reward against its own balance, never a total', async () => {
		const shared = await partnership('them');
		await setTestBalance(harness.db, adaSolo, ada, ada, 5);
		await createTestReward(harness.db, shared, jun, { cost: 6 });
		await setTestBalance(harness.db, shared, jun, ada, 2);
		const names = new Map([[shared, testPartnerView(shared, 'Jun').names]]);

		const widget = await getRewardsWidget(harness.db, ada.id, [adaSolo, shared], names);
		// Unaffordable, so it is not offered and not counted anywhere the card
		// can render — only `activeCount`, which the claiming side never shows.
		expect(widget).toMatchObject({ claimable: [], claimableCount: 0, activeCount: 1 });
		// And both balances are reported separately, so the card can show them.
		expect(widget.balances).toEqual([
			{ id: adaSolo, label: null, credits: 5 },
			{ id: shared, label: names.get(shared), credits: 2 }
		]);
	});

	it('leaves out a space you manage alone — no rows and no balance line', async () => {
		const shared = await partnership('me');
		await createTestReward(harness.db, shared, ada);
		await setTestBalance(harness.db, shared, ada, jun, 4);
		const names = new Map([[shared, testPartnerView(shared, 'Jun').names]]);

		const widget = await getRewardsWidget(harness.db, ada.id, [adaSolo, shared], names);
		expect(widget).toMatchObject({ viewerActs: true, activeCount: 0, claimable: [] });
		// A balance with nothing to spend it on is a number with no question
		// attached — and this one is Jun's, not Ada's, anyway.
		expect(widget.balances).toEqual([{ id: adaSolo, label: null, credits: 0 }]);
	});

	it('labels no balance when it covers only one space', async () => {
		const shared = await partnership('them');
		await setTestBalance(harness.db, shared, jun, ada, 3);
		const names = new Map([[shared, testPartnerView(shared, 'Jun').names]]);

		const widget = await getRewardsWidget(harness.db, ada.id, [shared], names);
		expect(widget.balances).toEqual([{ id: shared, label: null, credits: 3 }]);
	});

	it('shows at most three rows, cheapest first, and counts the rest', async () => {
		await setTestBalance(harness.db, adaSolo, ada, ada, 10);
		for (const cost of [5, 1, 4, 2, 3]) {
			await createTestReward(harness.db, adaSolo, ada, { cost });
		}

		const widget = await getRewardsWidget(harness.db, ada.id, [adaSolo], new Map());
		expect(widget.claimable.map((row) => row.note)).toEqual(['1', '2', '3']);
		expect(widget).toMatchObject({ claimableCount: 5, activeCount: 5 });
	});
});
