import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db';
import {
	claimTestPartnershipReward,
	createTestInvite,
	createTestPartnership,
	createTestPartnershipReward,
	createTestSelfReward,
	createTestUser,
	readPartnershipRewardClaimRows,
	readPartnershipRewardCreditRow,
	readSelfRewardClaimRows,
	readSelfRewardCreditRow,
	setTestPartnershipRewardCredits,
	setTestSelfRewardCredits,
	type TestUser
} from '../testing/fixtures';
import { partnerships } from './db/schema';
import {
	claimPartnershipReward,
	claimSelfReward,
	createPartnershipReward,
	getHomeRewardsWidget,
	getPartnershipRewardsPage,
	getPartnershipRewardsWidget,
	getSelfRewardsSection,
	listHomePartnerRewardSections,
	requireRewardMembership,
	setPartnershipRewardCredits
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
		const { id } = await createTestSelfReward(harness.db, ada, {
			title: 'Solo reward',
			cost: 4
		});
		await setTestSelfRewardCredits(harness.db, ada, 6);

		const before = await getSelfRewardsSection(harness.db, ada.id);
		expect(before.credits).toBe(6);
		expect(before.rewards).toContainEqual(
			expect.objectContaining({ id, title: 'Solo reward', canClaim: true })
		);

		await expect(claimSelfReward(harness.db, ada.id, id)).resolves.toEqual({ ok: true });
		await expect(readSelfRewardCreditRow(harness.db, ada.id)).resolves.toMatchObject({
			credits: 2
		});
		await expect(readSelfRewardClaimRows(harness.db, ada.id)).resolves.toContainEqual(
			expect.objectContaining({ rewardTitle: 'Solo reward', rewardCost: 4 })
		);
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

describe('partnership rewards', () => {
	it("lets the controller create rewards and set the other person's credits", async () => {
		const controlled = (await createTestPartnership(harness.db, ada, jun, { control: 'me' })).id;

		await expect(
			createPartnershipReward(harness.db, controlled, ada.id, {
				title: 'Partner reward',
				description: 'A treat',
				cost: 3,
				active: true
			})
		).resolves.toMatchObject({ ok: true });

		await expect(
			createPartnershipReward(harness.db, controlled, jun.id, {
				title: 'Nope',
				description: null,
				cost: 1,
				active: true
			})
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
				name: 'Them',
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

		await createTestPartnershipReward(harness.db, withJun, jun, { title: 'Jun reward' });
		await createTestPartnershipReward(harness.db, withCas, cas, { title: 'Cas reward' });
		await createTestPartnershipReward(harness.db, withCas, ada, { title: 'Ada reward in Cas' });
		await createTestPartnershipReward(harness.db, withPat, pat, { title: 'Pat reward' });
		await createTestPartnershipReward(harness.db, withPat, pat, {
			title: 'Inactive Pat reward',
			active: false
		});

		await setTestPartnershipRewardCredits(harness.db, withJun, jun, ada, 5);
		await setTestPartnershipRewardCredits(harness.db, withCas, ada, cas, 3);
		await setTestPartnershipRewardCredits(harness.db, withCas, cas, ada, 3);
		await setTestPartnershipRewardCredits(harness.db, withPat, pat, ada, 3);

		await harness.db
			.update(partnerships)
			.set({ control: 'inviter' })
			.where(eq(partnerships.id, withPat));

		const sections = await listHomePartnerRewardSections(harness.db, ada.id, [
			{ id: withCas, name: 'Cas', image: null },
			{ id: withJun, name: 'Jun', image: null },
			{ id: withPat, name: 'Pat', image: null }
		]);

		expect(sections.map((section) => section.name)).toEqual(['Cas', 'Jun']);
		expect(sections[0]).toMatchObject({
			partnershipId: withCas,
			credits: 3,
			rewards: [
				expect.objectContaining({ title: 'Cas reward', createdByMe: false, canClaim: true })
			]
		});
		expect(sections[1]).toMatchObject({
			partnershipId: withJun,
			credits: 5,
			rewards: [
				expect.objectContaining({ title: 'Jun reward', createdByMe: false, canClaim: true })
			]
		});
		expect(sections[1].rewards).toHaveLength(1);
	});
});

describe('reward widgets', () => {
	it('splits affordable from out of reach against the current balance', async () => {
		await setTestSelfRewardCredits(harness.db, ada, 5);
		await createTestSelfReward(harness.db, ada, { title: 'Exactly affordable', cost: 5 });
		await createTestSelfReward(harness.db, ada, { title: 'One too many', cost: 6 });
		await createTestSelfReward(harness.db, ada, { title: 'Shelved', cost: 1, active: false });

		const widget = await getHomeRewardsWidget(harness.db, ada.id, []);
		expect(widget).toMatchObject({
			viewerActs: true,
			balances: [{ id: 'self', label: null, credits: 5 }],
			// Cost equal to the balance is affordable, matching `claimSelfReward`'s
			// own `credits >= cost`. An off-by-one here would offer a claim the
			// claim path then refuses.
			claimable: [{ title: 'Exactly affordable', note: '5', context: null }],
			claimableCount: 1,
			activeCount: 2
		});
	});

	it('omits your own reward from your claimable list even under shared control', async () => {
		// 'mix' is the *answer* the invite form asks; it stores control 'both'.
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'mix' }))
			.id;
		await createTestPartnershipReward(harness.db, partnershipId, ada, {
			title: 'Ada wrote this',
			cost: 1
		});
		await createTestPartnershipReward(harness.db, partnershipId, jun, {
			title: 'Jun wrote this',
			cost: 1
		});
		// Jun sets Ada's balance, not Ada herself: `setPartnershipRewardCredits`
		// refuses a self-target whoever holds control.
		await setTestPartnershipRewardCredits(harness.db, partnershipId, jun, ada, 10);

		const widget = await getPartnershipRewardsWidget(harness.db, partnershipId, ada.id);
		expect(widget).toMatchObject({
			viewerActs: true,
			claimable: [{ title: 'Jun wrote this' }],
			claimableCount: 1
		});
	});

	it('shows the managing side only what it authored, and no claim list', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'me' })).id;
		await createTestPartnershipReward(harness.db, partnershipId, ada, { title: 'Ada set this' });

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
		await createTestSelfReward(harness.db, ada, { title: 'Ada set this for herself', cost: 5 });
		await createTestPartnershipReward(harness.db, partnershipId, jun, {
			title: 'Jun set this',
			cost: 2
		});
		await setTestPartnershipRewardCredits(harness.db, partnershipId, jun, ada, 2);

		const widget = await getHomeRewardsWidget(harness.db, ada.id, [
			{ id: partnershipId, name: 'Jun', image: null }
		]);

		expect(widget.activeCount).toBe(2);
		expect(widget.claimable).toEqual([
			// Cheapest first across BOTH sources, not self first.
			expect.objectContaining({ title: 'Jun set this', context: 'Jun' }),
			expect.objectContaining({ title: 'Ada set this for herself', context: null })
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
		await createTestPartnershipReward(harness.db, partnershipId, jun, {
			title: 'Out of reach',
			cost: 6
		});
		await setTestPartnershipRewardCredits(harness.db, partnershipId, jun, ada, 2);

		const widget = await getHomeRewardsWidget(harness.db, ada.id, [
			{ id: partnershipId, name: 'Jun', image: null }
		]);
		// Unaffordable, so it is not offered and not counted anywhere the card
		// can render — only `activeCount`, which the claiming side never shows.
		expect(widget).toMatchObject({ claimable: [], claimableCount: 0, activeCount: 1 });
		// And both balances are reported separately, so the card can show them.
		expect(widget.balances).toEqual([
			{ id: 'self', label: null, credits: 5 },
			{ id: partnershipId, label: 'Jun', credits: 2 }
		]);
	});

	it('leaves out a partnership you manage — that side is the partner page', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'me' })).id;
		await createTestPartnershipReward(harness.db, partnershipId, ada, { title: 'Ada set this' });

		const widget = await getHomeRewardsWidget(harness.db, ada.id, [
			{ id: partnershipId, name: 'Jun', image: null }
		]);
		expect(widget).toMatchObject({ activeCount: 0, claimable: [] });
		// No balance line either: a balance with nothing to spend it on is a
		// number with no question attached.
		expect(widget.balances).toEqual([{ id: 'self', label: null, credits: 0 }]);
	});
});
