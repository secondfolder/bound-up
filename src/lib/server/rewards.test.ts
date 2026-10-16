import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RewardInput } from '../rewards';
import { createTestDb, type TestDb } from '../testing/db';
import { defined } from '../testing/defined';
import {
	claimTestPartnershipReward,
	createTestInvite,
	createTestPartnership,
	createTestPartnershipReward,
	createTestSelfReward,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readPartnershipRewardClaimRows,
	readPartnershipRewardCreditRow,
	readPartnershipRewardRow,
	readSelfRewardClaimRows,
	readSelfRewardCreditRow,
	readSelfRewardRow,
	setTestPartnershipRewardCredits,
	setTestSelfRewardCredits,
	type TestUser
} from '../testing/fixtures';
import { testPartnerView } from '../testing/names';
import { partnerships } from './db/schema';
import {
	claimPartnershipReward,
	claimSelfReward,
	createPartnershipReward,
	createSelfReward,
	getHomeRewardsWidget,
	getPartnershipRewardsPage,
	getPartnershipRewardsWidget,
	getSelfRewardForUser,
	getSelfRewardsSection,
	listHomePartnerRewardSections,
	requireRewardMembership,
	setPartnershipRewardCredits,
	updatePartnershipReward,
	updateSelfReward
} from './rewards';

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	jun = await createTestUser(harness.db, { name: 'Jun' });
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

describe('requireRewardMembership', () => {
	it('admits both members and nobody else', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
		await expect(requireRewardMembership(harness.db, partnershipId, ada.id)).resolves.toMatchObject(
			{
				viewerId: ada.id
			}
		);
		await expect(requireRewardMembership(harness.db, partnershipId, jun.id)).resolves.toBeTruthy();

		const stranger = await createTestUser(harness.db, { name: 'Stranger' });
		await expect(
			requireRewardMembership(harness.db, partnershipId, stranger.id)
		).resolves.toBeNull();
	});

	it('refuses a pending invite', async () => {
		const invite = await createTestInvite(harness.db, ada);
		await expect(requireRewardMembership(harness.db, invite.id, ada.id)).resolves.toBeNull();
	});
});

describe('self rewards', () => {
	it('lists, claims, and deducts credits from a self reward', async () => {
		const { id, ciphertext } = await createTestSelfReward(harness.db, ada, { cost: 4 });
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		await setTestSelfRewardCredits(harness.db, ada, 6);

		const before = await getSelfRewardsSection(harness.db, ada.id);
		expect(before.credits).toBe(6);
		expect(before.rewards).toContainEqual(
			expect.objectContaining({
				id,
				sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 },
				revision: 0,
				canClaim: true
			})
		);

		await expect(claimSelfReward(harness.db, ada.id, id)).resolves.toEqual({ ok: true });
		await expect(readSelfRewardCreditRow(harness.db, ada.id)).resolves.toMatchObject({
			credits: 2
		});
		await expect(readSelfRewardClaimRows(harness.db, ada.id)).resolves.toContainEqual(
			expect.objectContaining({ rewardId: id, rewardCost: 4 })
		);
	});

	it('keeps no plaintext on a sealed row, and hands back none', async () => {
		const { id } = await createTestSelfReward(harness.db, ada);

		await expect(readSelfRewardRow(harness.db, id)).resolves.toMatchObject({
			title: '',
			description: null
		});
		const reward = defined(await getSelfRewardForUser(harness.db, ada.id, id), 'reward');
		expect(reward).toMatchObject({ title: '', description: null });
	});

	it('snapshots the sealed reward at claim time, not as later edited', async () => {
		const { id, ciphertext } = await createTestSelfReward(harness.db, ada, { cost: 1 });
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		await setTestSelfRewardCredits(harness.db, ada, 1);

		await expect(claimSelfReward(harness.db, ada.id, id)).resolves.toEqual({ ok: true });
		await updateSelfReward(harness.db, ada.id, id, {
			...rewardInput(vaultId, { ciphertext: fakeSealed('edited') }),
			expectedRevision: 0
		});

		const [claim] = await readSelfRewardClaimRows(harness.db, ada.id);
		expect(defined(claim, 'claim row')).toMatchObject({
			snapshotCiphertext: ciphertext,
			snapshotVaultId: vaultId,
			snapshotVersion: 1,
			snapshotRecordId: id,
			rewardTitle: '',
			rewardDescription: null
		});
		const section = await getSelfRewardsSection(harness.db, ada.id);
		expect(section.claims).toEqual([
			expect.objectContaining({
				rewardTitle: '',
				sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 }
			})
		]);
	});

	it('refuses an inactive self reward', async () => {
		const { id } = await createTestSelfReward(harness.db, ada, { active: false });
		await setTestSelfRewardCredits(harness.db, ada, 10);

		await expect(claimSelfReward(harness.db, ada.id, id)).resolves.toEqual({
			ok: false,
			reason: 'inactive'
		});
		await expect(readSelfRewardClaimRows(harness.db, ada.id)).resolves.toEqual([]);
	});
});

describe('self reward writes', () => {
	it('refuses a create naming an id that is already taken, and changes nothing', async () => {
		const { id, ciphertext } = await createTestSelfReward(harness.db, ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);

		await expect(createSelfReward(harness.db, ada.id, id, rewardInput(vaultId))).resolves.toEqual({
			ok: false,
			reason: 'id-taken'
		});
		await expect(readSelfRewardRow(harness.db, id)).resolves.toMatchObject({ ciphertext });
	});

	it('bumps the revision on an update made at the current revision', async () => {
		const { id } = await createTestSelfReward(harness.db, ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const ciphertext = fakeSealed('v1');

		await expect(
			updateSelfReward(harness.db, ada.id, id, {
				...rewardInput(vaultId, { ciphertext, cost: 9 }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: true });
		await expect(readSelfRewardRow(harness.db, id)).resolves.toMatchObject({
			revision: 1,
			ciphertext,
			cost: 9
		});
	});

	it('refuses an update made at a stale revision, and keeps the newer content', async () => {
		const { id } = await createTestSelfReward(harness.db, ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const newer = fakeSealed('newer');

		await updateSelfReward(harness.db, ada.id, id, {
			...rewardInput(vaultId, { ciphertext: newer }),
			expectedRevision: 0
		});
		await expect(
			updateSelfReward(harness.db, ada.id, id, {
				...rewardInput(vaultId, { ciphertext: fakeSealed('stale') }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'conflict' });
		await expect(readSelfRewardRow(harness.db, id)).resolves.toMatchObject({
			revision: 1,
			ciphertext: newer
		});
	});

	it("reports not-found, not conflict, for someone else's reward", async () => {
		const { id } = await createTestSelfReward(harness.db, jun);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);

		await expect(
			updateSelfReward(harness.db, ada.id, id, { ...rewardInput(vaultId), expectedRevision: 0 })
		).resolves.toEqual({ ok: false, reason: 'not-found' });
	});

	it("refuses content sealed under another scope's vault", async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
		const partnershipVault = await ensureTestPartnershipVault(harness.db, partnershipId);
		const junsVault = await ensureTestSelfVault(harness.db, jun.id);
		await ensureTestSelfVault(harness.db, ada.id);

		for (const vaultId of [partnershipVault, junsVault]) {
			await expect(
				createSelfReward(harness.db, ada.id, crypto.randomUUID(), rewardInput(vaultId))
			).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
		}

		const { id, ciphertext } = await createTestSelfReward(harness.db, ada);
		await expect(
			updateSelfReward(harness.db, ada.id, id, {
				...rewardInput(partnershipVault),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
		await expect(readSelfRewardRow(harness.db, id)).resolves.toMatchObject({ ciphertext });
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
			createSelfReward(harness.db, ada.id, id, rewardInput(vaultId, overrides))
		).resolves.toEqual({ ok: false, reason: 'bad-content' });
		await expect(readSelfRewardRow(harness.db, id)).resolves.toBeUndefined();
	});
});

describe('partnership rewards', () => {
	it("lets the controller create rewards and set the other person's credits", async () => {
		const controlled = (await createTestPartnership(harness.db, ada, jun, { control: 'me' })).id;
		const vaultId = await ensureTestPartnershipVault(harness.db, controlled);
		const id = crypto.randomUUID();
		const ciphertext = fakeSealed('partner');

		await expect(
			createPartnershipReward(
				harness.db,
				controlled,
				ada.id,
				id,
				rewardInput(vaultId, { ciphertext, cost: 3 })
			)
		).resolves.toEqual({ ok: true, id });
		await expect(readPartnershipRewardRow(harness.db, id)).resolves.toMatchObject({
			ciphertext,
			vaultId,
			revision: 0,
			title: '',
			description: null
		});

		await expect(
			createPartnershipReward(
				harness.db,
				controlled,
				jun.id,
				crypto.randomUUID(),
				rewardInput(vaultId)
			)
		).resolves.toEqual({ ok: false, reason: 'forbidden' });

		await expect(
			setPartnershipRewardCredits(harness.db, controlled, ada.id, jun.id, 5)
		).resolves.toEqual({ ok: true });
		await expect(
			readPartnershipRewardCreditRow(harness.db, controlled, jun.id)
		).resolves.toMatchObject({ credits: 5 });

		await expect(
			setPartnershipRewardCredits(harness.db, controlled, ada.id, ada.id, 5)
		).resolves.toEqual({ ok: false, reason: 'bad-target' });
	});

	it("lets the claimant side redeem the other partner's reward", async () => {
		const claimantView = (await createTestPartnership(harness.db, ada, jun, { control: 'them' }))
			.id;
		const { id } = await createTestPartnershipReward(harness.db, claimantView, jun, { cost: 2 });
		await setTestPartnershipRewardCredits(harness.db, claimantView, jun, ada, 4);

		await expect(
			claimPartnershipReward(harness.db, {
				partnershipId: claimantView,
				rewardId: id,
				userId: ada.id
			})
		).resolves.toEqual({ ok: true });
		await expect(
			readPartnershipRewardCreditRow(harness.db, claimantView, ada.id)
		).resolves.toMatchObject({ credits: 2 });
		await expect(readPartnershipRewardClaimRows(harness.db, claimantView)).resolves.toContainEqual(
			expect.objectContaining({ rewardId: id, claimedByUserId: ada.id, createdByUserId: jun.id })
		);
	});

	it("snapshots the author's sealed reward when the other member claims it", async () => {
		const claimantView = (await createTestPartnership(harness.db, ada, jun, { control: 'them' }))
			.id;
		const vaultId = await ensureTestPartnershipVault(harness.db, claimantView);
		const { id, ciphertext } = await createTestPartnershipReward(harness.db, claimantView, jun, {
			cost: 1
		});
		await setTestPartnershipRewardCredits(harness.db, claimantView, jun, ada, 1);

		await claimTestPartnershipReward(harness.db, claimantView, ada, id);

		const [claim] = await readPartnershipRewardClaimRows(harness.db, claimantView);
		expect(defined(claim, 'claim row')).toMatchObject({
			snapshotCiphertext: ciphertext,
			snapshotVaultId: vaultId,
			snapshotVersion: 1,
			snapshotRecordId: id,
			rewardTitle: '',
			rewardDescription: null
		});
		const page = defined(await getPartnershipRewardsPage(harness.db, claimantView, ada.id), 'page');
		expect(page.claims).toEqual([
			expect.objectContaining({
				mine: true,
				createdByMe: false,
				sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 }
			})
		]);
	});

	it('updates at the current revision and refuses a stale one', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'mix' }))
			.id;
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const { id } = await createTestPartnershipReward(harness.db, partnershipId, ada);
		const newer = fakeSealed('newer');

		await expect(
			updatePartnershipReward(harness.db, partnershipId, ada.id, id, {
				...rewardInput(vaultId, { ciphertext: newer }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: true });
		await expect(
			updatePartnershipReward(harness.db, partnershipId, jun.id, id, {
				...rewardInput(vaultId, { ciphertext: fakeSealed('stale') }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'conflict' });

		await expect(readPartnershipRewardRow(harness.db, id)).resolves.toMatchObject({
			revision: 1,
			ciphertext: newer
		});
	});

	it("refuses content sealed under another scope's vault", async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
		const cas = await createTestUser(harness.db, { name: 'Cas' });
		const other = (await createTestPartnership(harness.db, ada, cas)).id;
		await ensureTestPartnershipVault(harness.db, partnershipId);
		const otherVault = await ensureTestPartnershipVault(harness.db, other);
		const adasVault = await ensureTestSelfVault(harness.db, ada.id);

		for (const vaultId of [otherVault, adasVault]) {
			await expect(
				createPartnershipReward(
					harness.db,
					partnershipId,
					ada.id,
					crypto.randomUUID(),
					rewardInput(vaultId)
				)
			).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
		}

		const { id, ciphertext } = await createTestPartnershipReward(harness.db, partnershipId, ada);
		await expect(
			updatePartnershipReward(harness.db, partnershipId, ada.id, id, {
				...rewardInput(otherVault),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
		await expect(readPartnershipRewardRow(harness.db, id)).resolves.toMatchObject({ ciphertext });
	});

	it('refuses a malformed ciphertext', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);

		await expect(
			createPartnershipReward(
				harness.db,
				partnershipId,
				ada.id,
				crypto.randomUUID(),
				rewardInput(vaultId, { ciphertext: 'plain title' })
			)
		).resolves.toEqual({ ok: false, reason: 'bad-content' });
	});

	it('blocks the author from claiming their own reward under shared control', async () => {
		const shared = (await createTestPartnership(harness.db, ada, jun, { control: 'mix' })).id;
		const { id } = await createTestPartnershipReward(harness.db, shared, ada, { cost: 2 });
		await setTestPartnershipRewardCredits(harness.db, shared, ada, jun, 3);

		await expect(
			claimPartnershipReward(harness.db, { partnershipId: shared, rewardId: id, userId: ada.id })
		).resolves.toEqual({ ok: false, reason: 'own-reward' });

		await claimTestPartnershipReward(harness.db, shared, jun, id);
		await expect(readPartnershipRewardClaimRows(harness.db, shared)).resolves.toContainEqual(
			expect.objectContaining({ rewardId: id, claimedByUserId: jun.id })
		);
	});

	it('uses current control to decide claimability, not old authorship alone', async () => {
		const shared = (await createTestPartnership(harness.db, ada, jun, { control: 'mix' })).id;
		const { id } = await createTestPartnershipReward(harness.db, shared, jun, { cost: 2 });
		await setTestPartnershipRewardCredits(harness.db, shared, jun, ada, 3);

		await harness.db
			.update(partnerships)
			.set({ control: 'inviter' })
			.where(eq(partnerships.id, shared));

		await expect(
			claimPartnershipReward(harness.db, { partnershipId: shared, rewardId: id, userId: ada.id })
		).resolves.toEqual({ ok: false, reason: 'not-allowed' });
	});

	it('returns viewer-facing reward data for the partner page', async () => {
		const claimantView = (await createTestPartnership(harness.db, ada, jun, { control: 'them' }))
			.id;
		const { id } = await createTestPartnershipReward(harness.db, claimantView, jun, { cost: 5 });
		await setTestPartnershipRewardCredits(harness.db, claimantView, jun, ada, 4);

		const page = await getPartnershipRewardsPage(harness.db, claimantView, ada.id);
		expect(page).toMatchObject({
			partner: {
				id: claimantView,
				// Ada is the inviter, so the source is read from her end.
				names: expect.objectContaining({ partnershipId: claimantView, role: 'inviter' }),
				canManageRewards: false,
				canClaimRewards: true
			},
			viewerCredits: 4,
			counterpartCredits: null
		});
		expect(page?.rewards).toContainEqual(
			expect.objectContaining({ id, createdByMe: false, canClaim: false })
		);
	});
});

describe('home rewards aggregation', () => {
	it('orders sections by the incoming partner order and shows only counterpart-authored active rewards', async () => {
		const cas = await createTestUser(harness.db, { name: 'Cas' });
		const pat = await createTestUser(harness.db, { name: 'Pat' });
		const withJun = (await createTestPartnership(harness.db, ada, jun, { control: 'them' })).id;
		const withCas = (await createTestPartnership(harness.db, ada, cas, { control: 'mix' })).id;
		const withPat = (await createTestPartnership(harness.db, ada, pat, { control: 'mix' })).id;

		const junReward = await createTestPartnershipReward(harness.db, withJun, jun);
		const casReward = await createTestPartnershipReward(harness.db, withCas, cas);
		await createTestPartnershipReward(harness.db, withCas, ada);
		await createTestPartnershipReward(harness.db, withPat, pat);
		await createTestPartnershipReward(harness.db, withPat, pat, { active: false });

		await setTestPartnershipRewardCredits(harness.db, withJun, jun, ada, 5);
		await setTestPartnershipRewardCredits(harness.db, withCas, ada, cas, 3);
		await setTestPartnershipRewardCredits(harness.db, withCas, cas, ada, 3);
		await setTestPartnershipRewardCredits(harness.db, withPat, pat, ada, 3);

		await harness.db
			.update(partnerships)
			.set({ control: 'inviter' })
			.where(eq(partnerships.id, withPat));

		const sections = await listHomePartnerRewardSections(harness.db, ada.id, [
			testPartnerView(withCas, 'Cas'),
			testPartnerView(withJun, 'Jun'),
			testPartnerView(withPat, 'Pat')
		]);

		// The names are passed through untouched: the server cannot read them.
		expect(sections.map((section) => section.names)).toEqual([
			testPartnerView(withCas, 'Cas').names,
			testPartnerView(withJun, 'Jun').names
		]);
		expect(sections[0]).toMatchObject({
			partnershipId: withCas,
			credits: 3,
			rewards: [
				expect.objectContaining({
					id: casReward.id,
					sealed: expect.objectContaining({ ciphertext: casReward.ciphertext }),
					createdByMe: false,
					canClaim: true
				})
			]
		});
		expect(sections[1]).toMatchObject({
			partnershipId: withJun,
			credits: 5,
			rewards: [
				expect.objectContaining({
					id: junReward.id,
					sealed: expect.objectContaining({ ciphertext: junReward.ciphertext }),
					createdByMe: false,
					canClaim: true
				})
			]
		});
		expect(sections[1].rewards).toHaveLength(1);
	});
});

describe('reward widgets', () => {
	it('splits affordable from out of reach against the current balance', async () => {
		await setTestSelfRewardCredits(harness.db, ada, 5);
		const affordable = await createTestSelfReward(harness.db, ada, { cost: 5 });
		await createTestSelfReward(harness.db, ada, { cost: 6 });
		await createTestSelfReward(harness.db, ada, { cost: 1, active: false });

		const widget = await getHomeRewardsWidget(harness.db, ada.id, []);
		expect(widget).toMatchObject({
			viewerActs: true,
			balances: [{ id: 'self', label: null, credits: 5 }],
			// Cost equal to the balance is affordable, matching `claimSelfReward`'s
			// own `credits >= cost`. An off-by-one here would offer a claim the
			// claim path then refuses.
			claimable: [{ id: affordable.id, note: '5', context: null }],
			claimableCount: 1,
			activeCount: 2
		});
	});

	it('carries each row as a sealed ref, with no plaintext title', async () => {
		await setTestSelfRewardCredits(harness.db, ada, 5);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const { id, ciphertext } = await createTestSelfReward(harness.db, ada, { cost: 2 });

		const widget = await getHomeRewardsWidget(harness.db, ada.id, []);
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
		// 'mix' is the *answer* the invite form asks; it stores control 'both'.
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'mix' }))
			.id;
		await createTestPartnershipReward(harness.db, partnershipId, ada, { cost: 1 });
		const juns = await createTestPartnershipReward(harness.db, partnershipId, jun, { cost: 1 });
		// Jun sets Ada's balance, not Ada herself: `setPartnershipRewardCredits`
		// refuses a self-target whoever holds control.
		await setTestPartnershipRewardCredits(harness.db, partnershipId, jun, ada, 10);

		const widget = await getPartnershipRewardsWidget(harness.db, partnershipId, ada.id);
		expect(widget).toMatchObject({
			viewerActs: true,
			claimable: [
				{ id: juns.id, sealed: expect.objectContaining({ ciphertext: juns.ciphertext }) }
			],
			claimableCount: 1
		});
	});

	it('shows the managing side only what it authored, and no claim list', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'me' })).id;
		await createTestPartnershipReward(harness.db, partnershipId, ada);

		const widget = await getPartnershipRewardsWidget(harness.db, partnershipId, ada.id);
		expect(widget).toMatchObject({ viewerActs: false, activeCount: 1, claimable: [] });
	});

	it('returns null for someone who is not in the partnership', async () => {
		const stranger = await createTestUser(harness.db);
		const partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;

		await expect(
			getPartnershipRewardsWidget(harness.db, partnershipId, stranger.id)
		).resolves.toBeNull();
	});

	/** The rewards half of the same bug: /home showed self rewards only. */
	it('merges partner rewards you can claim with your own, naming whose is whose', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'them' }))
			.id;
		await setTestSelfRewardCredits(harness.db, ada, 5);
		const own = await createTestSelfReward(harness.db, ada, { cost: 5 });
		const juns = await createTestPartnershipReward(harness.db, partnershipId, jun, { cost: 2 });
		await setTestPartnershipRewardCredits(harness.db, partnershipId, jun, ada, 2);

		const widget = await getHomeRewardsWidget(harness.db, ada.id, [
			testPartnerView(partnershipId, 'Jun')
		]);

		expect(widget.activeCount).toBe(2);
		expect(widget.claimable).toEqual([
			// Cheapest first across BOTH sources, not self first.
			expect.objectContaining({
				id: juns.id,
				context: testPartnerView(partnershipId, 'Jun').names
			}),
			expect.objectContaining({ id: own.id, context: null })
		]);
	});

	/**
	 * Credits do not pool, and this is what goes wrong if they are summed: 5
	 * self credits plus 2 partnership credits would "afford" a 6-credit
	 * partnership reward the claim path then refuses.
	 */
	it('prices each reward against its own balance, never a total', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'them' }))
			.id;
		await setTestSelfRewardCredits(harness.db, ada, 5);
		await createTestPartnershipReward(harness.db, partnershipId, jun, { cost: 6 });
		await setTestPartnershipRewardCredits(harness.db, partnershipId, jun, ada, 2);

		const widget = await getHomeRewardsWidget(harness.db, ada.id, [
			testPartnerView(partnershipId, 'Jun')
		]);
		// Unaffordable, so it is not offered and not counted anywhere the card
		// can render — only `activeCount`, which the claiming side never shows.
		expect(widget).toMatchObject({ claimable: [], claimableCount: 0, activeCount: 1 });
		// And both balances are reported separately, so the card can show them.
		expect(widget.balances).toEqual([
			{ id: 'self', label: null, credits: 5 },
			{ id: partnershipId, label: testPartnerView(partnershipId, 'Jun').names, credits: 2 }
		]);
	});

	it('leaves out a partnership you manage — that side is the partner page', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'me' })).id;
		await createTestPartnershipReward(harness.db, partnershipId, ada);

		const widget = await getHomeRewardsWidget(harness.db, ada.id, [
			testPartnerView(partnershipId, 'Jun')
		]);
		expect(widget).toMatchObject({ activeCount: 0, claimable: [] });
		// No balance line either: a balance with nothing to spend it on is a
		// number with no question attached.
		expect(widget.balances).toEqual([{ id: 'self', label: null, credits: 0 }]);
	});
});
