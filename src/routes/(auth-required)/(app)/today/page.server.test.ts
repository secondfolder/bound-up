import { afterEach, beforeEach, describe, expect, it, it as test } from 'vitest';
import type { FeatureKey } from '$lib/features';
import type { Db } from '$lib/server/db';
import { guides, iqTestResults } from '$lib/server/db/schema';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestInvite,
	createTestPartnership,
	createTestPartnershipReward,
	createTestPartnershipTask,
	createTestSelfReward,
	createTestSelfTask,
	createTestThread,
	createTestUser,
	FAKE_INVITE_KEY_WRAP,
	setTestPartnershipRewardCredits,
	setTestSelfRewardCredits,
	type TestUser,
	testSoloSpace
} from '$lib/testing/fixtures';
import { testPartnerView } from '$lib/testing/names';
import type { PartnerView } from '$lib/types';
import { load } from './+page.server';
import type { PageServerData } from './$types';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada', timezone: 'Europe/London' });
	jun = await createTestUser(db, { name: 'Jun', timezone: 'America/New_York' });
});

afterEach(() => harness.close());

/**
 * Today on a device whose context cookie says `context` (absent: a device
 * that has never switched, which is Everyone).
 */
function at(
	user: TestUser | null,
	partners = [] as PartnerView[],
	features = [] as FeatureKey[],
	context?: string
) {
	return fakeEvent({
		db,
		user,
		path: '/today',
		parentData: { partners, features },
		...(context === undefined ? {} : { contextCookie: context })
	});
}

/** The page's data, narrowed to the context it was shown in. */
async function shown<Kind extends 'all' | 'solo' | 'shared'>(
	kind: Kind,
	event: ReturnType<typeof at>
) {
	const { context, today } = await runLoad(load(event));
	if (today.kind !== kind) {
		throw new Error(`Expected Today in ${kind}, got ${today.kind}`);
	}
	return { context, today: today as Extract<TodayView, { kind: Kind }> };
}

type TodayView = PageServerData['today'];

test('401s without a session', async () => {
	const result = await runAndCatch(() => runLoad(load(at(null))));
	expect(result).toMatchObject({ type: 'error', status: 401 });
});

describe('in Everyone', () => {
	it('is what a device that has never switched sees', async () => {
		const data = await runLoad(load(at(ada)));
		expect(data.context).toEqual({ kind: 'all' });
		expect(data.today.kind).toBe('all');
	});

	it('falls back to it for a context naming a partnership the viewer is not in', async () => {
		const stranger = await createTestUser(db);
		const { id } = await createTestPartnership(db, jun, stranger);
		const data = await runLoad(load(at(ada, [], [], id)));
		expect(data.context).toEqual({ kind: 'all' });
		expect(data.today.kind).toBe('all');
	});

	it('returns unread partner links from the layout partner list', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		await createTestThread(db, id, jun, { at: new Date('2026-09-13T12:00:00Z') });

		const data = await shown('all', at(ada, [testPartnerView(id, 'Jun')]));
		expect(data.today.unread).toContainEqual(
			expect.objectContaining({
				partnershipId: id,
				names: testPartnerView(id, 'Jun').names,
				unreadThreads: 1
			})
		);
	});

	it('previews the tasks that are ready to do right now', async () => {
		const stretches = await createTestSelfTask(db, ada, { creditsAwarded: 2 });
		await createTestSelfTask(db, ada, { active: false });

		const data = await shown('all', at(ada));
		expect(data.today.tasks.viewerActs).toBe(true);
		// The inactive one is not counted at all — a card that promised four
		// tasks and showed one would be worse than no card.
		expect(data.today.tasks.activeCount).toBe(1);
		expect(data.today.tasks.ready).toEqual([
			{
				id: stretches.id,
				title: '',
				kind: 'task',
				sealed: expect.objectContaining({
					recordId: stretches.id,
					ciphertext: stretches.ciphertext
				}),
				note: '+2',
				context: null
			}
		]);
	});

	it('previews only the rewards the balance actually covers', async () => {
		await setTestSelfRewardCredits(db, ada, 5);
		const bath = await createTestSelfReward(db, ada, { cost: 5 });
		await createTestSelfReward(db, ada, { cost: 50 });

		const data = await shown('all', at(ada));
		expect(data.today.rewards.balances).toEqual([
			{ id: await testSoloSpace(db, ada.id), label: null, credits: 5 }
		]);
		expect(data.today.rewards.claimable).toEqual([
			{
				id: bath.id,
				title: '',
				kind: 'reward',
				sealed: expect.objectContaining({ recordId: bath.id, ciphertext: bath.ciphertext }),
				note: '5',
				context: null
			}
		]);
		// The unaffordable one is simply absent: the card never names a reward
		// the balance does not cover.
		expect(data.today.rewards.claimableCount).toBe(1);
		expect(data.today.rewards.activeCount).toBe(2);
	});

	/**
	 * The cards are an overview of /tasks and /rewards in Everyone, which is
	 * where they lead, and those show your own things and every partner's. A
	 * card that read only the solo half reported "nothing to do" with a
	 * partner task waiting, which is the opposite of what the cards are for.
	 */
	it('carries partner tasks and rewards into the cards, not just your own', async () => {
		// Jun controls, so what Jun sets up is Ada's to do and to claim.
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const own = await createTestSelfTask(db, ada);
		const junsTask = await createTestPartnershipTask(db, id, jun);
		const junsReward = await createTestPartnershipReward(db, id, jun, { cost: 1 });
		await setTestPartnershipRewardCredits(db, id, jun, ada, 1);

		const data = await shown('all', at(ada, [testPartnerView(id, 'Jun')]));

		expect(data.today.tasks.ready).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: own.id, context: null }),
				expect.objectContaining({ id: junsTask.id, context: testPartnerView(id, 'Jun').names })
			])
		);
		expect(data.today.rewards.claimable).toEqual([
			expect.objectContaining({ id: junsReward.id, context: testPartnerView(id, 'Jun').names })
		]);
		// Both balances, separately — partnership credits do not buy self rewards.
		expect(data.today.rewards.balances).toEqual([
			{ id: await testSoloSpace(db, ada.id), label: null, credits: 0 },
			{ id, label: testPartnerView(id, 'Jun').names, credits: 1 }
		]);
	});

	it('has no daydreams card, even for an account with the feature', async () => {
		// Daydreams are a Playroom tool (docs/playroom.md), so Today reads none
		// of them: D1 charges for rows read by a card that is not there.
		await createTestDaydream(db, ada.id);
		const data = await shown('all', at(ada, [], ['daydreams']));
		expect(data.today).not.toHaveProperty('daydreams');
	});

	describe('the guides card', () => {
		beforeEach(async () => {
			// Explicit times: the card's order is createdAt then id, and ids are
			// UUIDs, so rows inserted in the same millisecond would sort at random.
			await db.insert(guides).values(
				['First', 'Second', 'Third', 'Fourth'].map((title, index) => ({
					title,
					createdAt: new Date(Date.UTC(2026, 0, index + 1))
				}))
			);
		});

		it('is absent for an account without the guides feature', async () => {
			const data = await shown('all', at(ada));
			expect(data.today.guides).toBeNull();
		});

		it('previews the first guides, and counts them all, for an account that has it', async () => {
			const data = await shown('all', at(ada, [], ['guides']));
			expect(data.today.guides).toEqual({
				guides: [
					{ id: expect.any(String), title: 'First' },
					{ id: expect.any(String), title: 'Second' },
					{ id: expect.any(String), title: 'Third' }
				],
				total: 4
			});
		});
	});

	it("gives the Playroom card the user's newest IQ result, and only theirs", async () => {
		expect((await shown('all', at(ada))).today.latestIq).toBeNull();

		const result = {
			role: 'sub' as const,
			intensity: 0 as const,
			vibe: null,
			correct: 4,
			attempted: 12,
			soberIq: null,
			targetIq: null,
			seed: 1
		};
		await db.insert(iqTestResults).values([
			{ ...result, ownerId: ada.id, iq: 90, createdAt: new Date('2026-10-01T10:00:00Z') },
			{ ...result, ownerId: ada.id, iq: 70, createdAt: new Date('2026-10-02T10:00:00Z') },
			{ ...result, ownerId: jun.id, iq: 130, createdAt: new Date('2026-10-03T10:00:00Z') }
		]);
		expect((await shown('all', at(ada))).today.latestIq?.iq).toBe(70);
	});
});

describe('in Me', () => {
	/**
	 * Me is what a screen shown to someone else can be left on, so this is a
	 * privacy rule, not tidiness: nothing of any partnership's may be in the
	 * data at all, not merely hidden by the page.
	 */
	it('shows your own cards and nothing of a partner’s', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const own = await createTestSelfTask(db, ada, { creditsAwarded: 2 });
		const junsTask = await createTestPartnershipTask(db, id, jun);
		await createTestPartnershipReward(db, id, jun, { cost: 1 });
		await setTestPartnershipRewardCredits(db, id, jun, ada, 1);
		await createTestThread(db, id, jun, { at: new Date('2026-09-13T12:00:00Z') });
		const solo = await testSoloSpace(db, ada.id);

		const data = await shown('solo', at(ada, [testPartnerView(id, 'Jun')], [], solo));
		expect(data.context).toEqual({ kind: 'space', spaceId: solo });
		expect(data.today.spaceId).toBe(solo);
		expect(data.today.tasks.ready.map((row) => row.id)).toEqual([own.id]);
		expect(data.today.rewards.balances).toEqual([{ id: solo, label: null, credits: 0 }]);
		expect(data.today.rewards.claimable).toEqual([]);
		// No messages card, no unread row, no partner header, and the
		// partnership's id nowhere in what the page is handed.
		expect(data.today).not.toHaveProperty('unread');
		expect(data.today).not.toHaveProperty('messages');
		expect(data.today).not.toHaveProperty('partner');
		const serialised = JSON.stringify(data.today);
		expect(serialised).not.toContain(id);
		expect(serialised).not.toContain(junsTask.id);
	});

	it('carries guides and the Playroom as the account allows, and no daydreams', async () => {
		const solo = await testSoloSpace(db, ada.id);
		await createTestDaydream(db, ada.id);
		await db.insert(guides).values({ title: 'A guide' });

		const without = await shown('solo', at(ada, [], [], solo));
		expect(without.today.guides).toBeNull();
		expect(without.today.latestIq).toBeNull();

		const withBoth = await shown('solo', at(ada, [], ['daydreams', 'guides'], solo));
		expect(withBoth.today).not.toHaveProperty('daydreams');
		expect(withBoth.today.guides?.total).toBe(1);
	});
});

describe('in a partnership’s context', () => {
	it('shows each side their own view of the same link in its header', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });

		const adas = await shown('shared', at(ada, [], [], id));
		expect(adas.context).toEqual({ kind: 'space', spaceId: id });
		expect(adas.today.partner).toEqual({
			id,
			names: {
				partnershipId: id,
				role: 'inviter',
				sealed: null,
				invite: expect.objectContaining({ keyWrap: FAKE_INVITE_KEY_WRAP })
			},
			timezone: 'America/New_York',
			canEdit: true
		});

		const juns = await shown('shared', at(jun, [], [], id));
		expect(juns.today.partner).toEqual({
			id,
			names: {
				partnershipId: id,
				role: 'invitee',
				sealed: null,
				invite: expect.objectContaining({ keyWrap: null })
			},
			timezone: 'Europe/London',
			canEdit: false
		});
	});

	/**
	 * The asymmetry is the point. One side manages tasks and rewards; the
	 * other completes and claims them. A "ready to do" list shown to the
	 * manager would be somebody else's to-do list, so the cards diverge — and
	 * the titles are withheld from the manager on the server.
	 */
	it('gives the side that completes a task a preview of it, and the other a count', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const task = await createTestPartnershipTask(db, id, ada, { creditsAwarded: 3 });

		const juns = await shown('shared', at(jun, [], [], id));
		expect(juns.today.tasks).toMatchObject({
			viewerActs: true,
			readyCount: 1,
			ready: [
				{
					title: '',
					kind: 'task',
					note: '+3',
					sealed: { recordId: task.id, ciphertext: task.ciphertext }
				}
			]
		});

		const adas = await shown('shared', at(ada, [], [], id));
		expect(adas.today.tasks).toMatchObject({ viewerActs: false, activeCount: 1, ready: [] });
	});

	it('gives the side that claims a reward its balance, and the other side a count', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const hourOff = await createTestPartnershipReward(db, id, ada, { cost: 4 });
		await createTestPartnershipReward(db, id, ada, { cost: 40 });
		await setTestPartnershipRewardCredits(db, id, ada, jun, 4);

		const juns = await shown('shared', at(jun, [], [], id));
		expect(juns.today.rewards).toMatchObject({
			// One space, so one unlabelled balance.
			balances: [{ label: null, credits: 4 }],
			viewerActs: true,
			claimable: [
				{
					kind: 'reward',
					note: '4',
					sealed: { recordId: hourOff.id, ciphertext: hourOff.ciphertext }
				}
			],
			activeCount: 2
		});

		const adas = await shown('shared', at(ada, [], [], id));
		expect(adas.today.rewards).toMatchObject({ viewerActs: false, activeCount: 2, claimable: [] });
	});

	it('counts unread threads without any way to read them', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		await createTestThread(db, id, ada, { at: new Date('2026-09-13T12:00:00Z') });

		const juns = await shown('shared', at(jun, [], [], id));
		expect(juns.today.messages).toMatchObject({ unreadThreads: 1, totalThreads: 1 });
		// Ada wrote it, so it is not unread for her — the same predicate as Everyone's.
		const adas = await shown('shared', at(ada, [], [], id));
		expect(adas.today.messages).toMatchObject({ unreadThreads: 0, totalThreads: 1 });
	});

	it('shows only that partnership, not another one the viewer is in', async () => {
		const cy = await createTestUser(db, { name: 'Cy' });
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const other = await createTestPartnership(db, ada, cy, { control: 'them' });
		const cysTask = await createTestPartnershipTask(db, other.id, cy);
		await createTestSelfTask(db, ada);

		const data = await shown('shared', at(ada, [], [], id));
		expect(data.today.tasks.ready).toEqual([]);
		expect(JSON.stringify(data.today)).not.toContain(cysTask.id);
	});

	it('is never offered for a pending invite: that context reads as Everyone', async () => {
		const invite = await createTestInvite(db, ada);
		const data = await runLoad(load(at(ada, [], [], invite.id)));
		expect(data.today.kind).toBe('all');
	});
});
