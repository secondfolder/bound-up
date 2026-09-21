import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { partnerships, selfTasks } from './db/schema';
import { createTestDb, type TestDb } from '../testing/db';
import {
	readPartnershipRewardCreditRow,
	createTestInvite,
	createTestPartnership,
	createTestPartnershipTask,
	createTestSelfTask,
	createTestUser,
	readSelfRewardCreditRow,
	readPartnershipTaskRow,
	readSelfTaskRow,
	type TestUser
} from '../testing/fixtures';
import {
	completePartnershipTask,
	completeSelfTask,
	createPartnershipTask,
	getPartnershipTasksPage,
	getHomeTasksWidget,
	getPartnershipTasksWidget,
	getSelfTaskForUser,
	getSelfTasksSection,
	listHomePartnerTaskSections,
	requireTaskMembership
} from './tasks';

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada', timezone: 'Europe/London' });
	jun = await createTestUser(harness.db, { name: 'Jun', timezone: 'America/New_York' });
});

afterEach(() => harness.close());

describe('requireTaskMembership', () => {
	it('admits both members and nobody else', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
		await expect(
			requireTaskMembership(harness.db, partnershipId, ada.id, ada.timezone)
		).resolves.toMatchObject({ viewerId: ada.id, counterpartUserId: jun.id });
		await expect(
			requireTaskMembership(harness.db, partnershipId, jun.id, jun.timezone)
		).resolves.toMatchObject({ viewerId: jun.id, counterpartUserId: ada.id });

		const stranger = await createTestUser(harness.db, { name: 'Stranger' });
		await expect(
			requireTaskMembership(harness.db, partnershipId, stranger.id, stranger.timezone)
		).resolves.toBeNull();
	});

	it('refuses a pending invite', async () => {
		const invite = await createTestInvite(harness.db, ada);
		await expect(
			requireTaskMembership(harness.db, invite.id, ada.id, ada.timezone)
		).resolves.toBeNull();
	});
});

describe('self tasks', () => {
	it('creates and lists a self task with owner-relative timezone handling', async () => {
		const { id } = await createTestSelfTask(harness.db, ada, {
			title: 'Morning task',
			completionMessages: ['One', 'Two']
		});

		await expect(readSelfTaskRow(harness.db, id)).resolves.toMatchObject({
			ownerId: ada.id,
			timezoneOwnerUserId: ada.id,
			title: 'Morning task'
		});

		const section = await getSelfTasksSection(harness.db, ada.id, ada.timezone);
		expect(section.tasks).toContainEqual(
			expect.objectContaining({
				id,
				title: 'Morning task',
				canComplete: true,
				timeZoneNote: null,
				completionMessages: ['One', 'Two']
			})
		);
	});

	it('completes a one-off self task, awards credits, and deactivates it', async () => {
		const { id } = await createTestSelfTask(harness.db, ada, {
			title: 'Solo task',
			creditsAwarded: 4,
			completionMessages: ['Well done']
		});

		await expect(completeSelfTask(harness.db, ada.id, ada.timezone, id)).resolves.toEqual({
			ok: true
		});
		await expect(readSelfRewardCreditRow(harness.db, ada.id)).resolves.toMatchObject({
			credits: 4
		});
		await expect(readSelfTaskRow(harness.db, id)).resolves.toMatchObject({
			active: false,
			completedCount: 1
		});

		const task = await getSelfTaskForUser(harness.db, ada.id, ada.timezone, id);
		expect(task).toMatchObject({ canComplete: false, active: false });
	});
});

describe('partnership tasks', () => {
	it('lets the controller create tasks and rejects an invalid timezone owner', async () => {
		const controlled = (await createTestPartnership(harness.db, ada, jun, { control: 'me' })).id;

		await expect(
			createPartnershipTask(harness.db, controlled, ada.id, ada.timezone, {
				title: 'Partner task',
				description: 'Do something',
				active: true,
				creditsAwarded: 3,
				completionMessages: ['Done'],
				schedule: { mode: 'one-off' },
				timezoneOwnerUserId: jun.id
			})
		).resolves.toMatchObject({ ok: true });

		const stranger = await createTestUser(harness.db, { name: 'Stranger' });
		await expect(
			createPartnershipTask(harness.db, controlled, ada.id, ada.timezone, {
				title: 'Bad task',
				description: null,
				active: true,
				creditsAwarded: 1,
				completionMessages: ['Nope'],
				schedule: { mode: 'one-off' },
				timezoneOwnerUserId: stranger.id
			})
		).resolves.toEqual({ ok: false, reason: 'bad-timezone-owner' });
	});

	it('rejects creation by the non-controller under one-sided control', async () => {
		const controlled = (await createTestPartnership(harness.db, ada, jun, { control: 'me' })).id;

		await expect(
			createPartnershipTask(harness.db, controlled, jun.id, jun.timezone, {
				title: 'Nope',
				description: null,
				active: true,
				creditsAwarded: 1,
				completionMessages: ['Nope'],
				schedule: { mode: 'one-off' },
				timezoneOwnerUserId: ada.id
			})
		).resolves.toEqual({ ok: false, reason: 'forbidden' });
	});

	it('returns viewer-facing task data for the partner page with timezone note metadata', async () => {
		// The clock is frozen because the anchor below is a fixed date and the
		// `canComplete: false` assertion means "not due yet". Left on the real
		// clock this passed until 2026-09-20 and failed every day after — the
		// task simply came due. Any test asserting a schedule's state has to
		// pin the date it is asserting that state relative to.
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-18T12:00:00Z'));

		const claimantView = (await createTestPartnership(harness.db, ada, jun, { control: 'them' }))
			.id;
		const anchor = '2026-09-20T10:00';
		const { id } = await createTestPartnershipTask(harness.db, claimantView, jun, {
			title: 'Jun task',
			schedule: {
				mode: 'scheduled',
				anchorLocal: anchor,
				frequency: 'week',
				interval: 1,
				weekdays: ['su'],
				end: { kind: 'never' }
			},
			timezoneOwnerUserId: jun.id
		});

		const page = await getPartnershipTasksPage(harness.db, claimantView, ada.id, ada.timezone);
		expect(page).toMatchObject({
			partner: {
				id: claimantView,
				name: 'Them',
				canManageTasks: false,
				canCompleteTasks: true,
				counterpartUserId: jun.id,
				counterpartTimezone: jun.timezone
			}
		});
		expect(page?.tasks).toContainEqual(
			expect.objectContaining({
				id,
				createdByMe: false,
				canManage: false,
				canComplete: false,
				timeZoneNote: {
					timeZone: jun.timezone,
					referenceTimeZone: ada.timezone,
					date: expect.any(Date),
					showCurrentTime: false
				}
			})
		);

		vi.useRealTimers();
	});

	it('omits the timezone note for one-off partner tasks with no task-local date', async () => {
		const claimantView = (await createTestPartnership(harness.db, ada, jun, { control: 'them' }))
			.id;
		const { id } = await createTestPartnershipTask(harness.db, claimantView, jun, {
			title: 'One-off partner task',
			schedule: { mode: 'one-off' },
			timezoneOwnerUserId: jun.id
		});

		const page = await getPartnershipTasksPage(harness.db, claimantView, ada.id, ada.timezone);
		expect(page?.tasks).toContainEqual(
			expect.objectContaining({
				id,
				timeZoneNote: null
			})
		);
	});

	it('awards credits to the completer and deactivates a one-off partnership task', async () => {
		const claimantView = (await createTestPartnership(harness.db, ada, jun, { control: 'them' }))
			.id;
		const { id } = await createTestPartnershipTask(harness.db, claimantView, jun, {
			title: 'Jun task',
			creditsAwarded: 5,
			completionMessages: ['Completed']
		});

		await expect(
			completePartnershipTask(harness.db, {
				partnershipId: claimantView,
				taskId: id,
				userId: ada.id,
				viewerTimezone: ada.timezone
			})
		).resolves.toEqual({ ok: true });

		await expect(
			readPartnershipRewardCreditRow(harness.db, claimantView, ada.id)
		).resolves.toMatchObject({
			credits: 5
		});
		await expect(readPartnershipTaskRow(harness.db, id)).resolves.toMatchObject({
			active: false,
			completedCount: 1
		});
	});

	it('blocks the author from completing their own task under shared control', async () => {
		const shared = (await createTestPartnership(harness.db, ada, jun, { control: 'mix' })).id;
		const { id } = await createTestPartnershipTask(harness.db, shared, ada, {
			title: 'Ada task'
		});

		await expect(
			completePartnershipTask(harness.db, {
				partnershipId: shared,
				taskId: id,
				userId: ada.id,
				viewerTimezone: ada.timezone
			})
		).resolves.toEqual({ ok: false, reason: 'own-task' });
	});

	it('hides tasks that are no longer on the viewer side after control changes', async () => {
		const shared = (await createTestPartnership(harness.db, ada, jun, { control: 'mix' })).id;
		const fromJun = await createTestPartnershipTask(harness.db, shared, jun, {
			title: 'Jun assigned this to Ada'
		});
		const fromAda = await createTestPartnershipTask(harness.db, shared, ada, {
			title: 'Ada assigned this to Jun'
		});

		await harness.db
			.update(partnerships)
			.set({ control: 'inviter' })
			.where(and(eq(partnerships.id, shared), eq(partnerships.inviterId, ada.id)));

		const page = await getPartnershipTasksPage(harness.db, shared, ada.id, ada.timezone);
		expect(page?.tasks).toContainEqual(
			expect.objectContaining({ id: fromAda.id, title: 'Ada assigned this to Jun' })
		);
		expect(page?.tasks).not.toContainEqual(
			expect.objectContaining({ id: fromJun.id, title: 'Jun assigned this to Ada' })
		);
		await expect(readPartnershipTaskRow(harness.db, fromJun.id)).resolves.toBeTruthy();
	});
});

describe('home tasks aggregation', () => {
	it('orders sections by the incoming partner order and shows only counterpart-authored active tasks', async () => {
		const cas = await createTestUser(harness.db, { name: 'Cas', timezone: 'Australia/Sydney' });
		const pat = await createTestUser(harness.db, { name: 'Pat', timezone: 'UTC' });
		const withJun = (await createTestPartnership(harness.db, ada, jun, { control: 'them' })).id;
		const withCas = (await createTestPartnership(harness.db, ada, cas, { control: 'mix' })).id;
		const withPat = (await createTestPartnership(harness.db, ada, pat, { control: 'me' })).id;

		await createTestPartnershipTask(harness.db, withJun, jun, { title: 'Jun task' });
		await createTestPartnershipTask(harness.db, withCas, cas, { title: 'Cas task' });
		await createTestPartnershipTask(harness.db, withCas, ada, { title: 'Ada task in Cas' });
		await createTestPartnershipTask(harness.db, withPat, ada, { title: 'Ada task in Pat' });

		const sections = await listHomePartnerTaskSections(harness.db, ada.id, ada.timezone, [
			{ id: withCas, name: 'Cas', image: null },
			{ id: withJun, name: 'Jun', image: null },
			{ id: withPat, name: 'Pat', image: null }
		]);

		expect(sections.map((section) => section.name)).toEqual(['Cas', 'Jun']);
		expect(sections[0]?.tasks).toContainEqual(
			expect.objectContaining({ title: 'Cas task', createdByMe: false })
		);
		expect(sections[0]?.tasks).toHaveLength(1);
		expect(sections[1]?.tasks).toContainEqual(
			expect.objectContaining({ title: 'Jun task', createdByMe: false })
		);
	});
});

describe('task widgets', () => {
	it('splits ready from waiting, and never counts an inactive task', async () => {
		await createTestSelfTask(harness.db, ada, { title: 'Ready now', creditsAwarded: 2 });
		await createTestSelfTask(harness.db, ada, { title: 'Shelved', active: false });

		const widget = await getHomeTasksWidget(harness.db, ada.id, []);
		expect(widget).toMatchObject({
			viewerActs: true,
			readyCount: 1,
			waitingCount: 0,
			activeCount: 1,
			ready: [{ title: 'Ready now', note: '+2', context: null }]
		});
	});

	it('counts a task whose schedule has not come round yet as waiting, not ready', async () => {
		const { id } = await createTestSelfTask(harness.db, ada, { title: 'Later' });
		// A whole day in the future, so `now` below is unambiguously before it
		// whatever timezone the fixture resolved the schedule against.
		const later = new Date(Date.now() + 24 * 60 * 60 * 1000);
		await harness.db.update(selfTasks).set({ nextEligibleAt: later }).where(eq(selfTasks.id, id));

		const widget = await getHomeTasksWidget(harness.db, ada.id, []);
		expect(widget).toMatchObject({ readyCount: 0, waitingCount: 1, activeCount: 1, ready: [] });
	});

	it('omits your own task from your ready list even under shared control', async () => {
		// 'mix' is the *answer* the invite form asks; it stores control 'both'.
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'mix' }))
			.id;
		await createTestPartnershipTask(harness.db, partnershipId, ada, { title: 'Ada wrote this' });
		await createTestPartnershipTask(harness.db, partnershipId, jun, { title: 'Jun wrote this' });

		// Shared control means both sides complete — but never their own, which
		// is the rule this widget is easiest to get wrong on.
		const adasWidget = await getPartnershipTasksWidget(
			harness.db,
			partnershipId,
			ada.id,
			ada.timezone
		);
		expect(adasWidget).toMatchObject({
			viewerActs: true,
			ready: [{ title: 'Jun wrote this' }],
			readyCount: 1
		});

		const junsWidget = await getPartnershipTasksWidget(
			harness.db,
			partnershipId,
			jun.id,
			jun.timezone
		);
		expect(junsWidget).toMatchObject({ ready: [{ title: 'Ada wrote this' }], readyCount: 1 });
	});

	it('returns null for someone who is not in the partnership', async () => {
		const stranger = await createTestUser(harness.db);
		const partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;

		await expect(
			getPartnershipTasksWidget(harness.db, partnershipId, stranger.id, stranger.timezone)
		).resolves.toBeNull();
	});

	/**
	 * /home is not a self-only view, and this is the bug that proves it: the
	 * card said "nothing to do" while a partner task sat waiting one tap away,
	 * because it only ever read `selfTasks`. It has to match /home/tasks, which
	 * shows your own section and one per partner.
	 */
	it('merges partner tasks assigned to you with your own, naming whose is whose', async () => {
		// Jun controls, so tasks Jun writes are Ada's to complete.
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'them' }))
			.id;
		await createTestSelfTask(harness.db, ada, { title: 'Ada wrote this for herself' });
		await createTestPartnershipTask(harness.db, partnershipId, jun, { title: 'Jun assigned this' });

		const widget = await getHomeTasksWidget(harness.db, ada.id, [
			{ id: partnershipId, name: 'Jun', image: null }
		]);

		expect(widget.activeCount).toBe(2);
		expect(widget.ready).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ title: 'Ada wrote this for herself', context: null }),
				// Attributed, because two partners can name a task the same thing.
				expect.objectContaining({ title: 'Jun assigned this', context: 'Jun' })
			])
		);
	});

	it('leaves out a partnership you manage — that side is the partner page', async () => {
		// Ada controls, so the task she wrote is Jun's to complete, not hers.
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'me' })).id;
		await createTestPartnershipTask(harness.db, partnershipId, ada, { title: 'Ada assigned this' });

		const widget = await getHomeTasksWidget(harness.db, ada.id, [
			{ id: partnershipId, name: 'Jun', image: null }
		]);
		expect(widget).toMatchObject({ activeCount: 0, ready: [] });

		// And it does show up for the side that has to do it.
		const junsWidget = await getHomeTasksWidget(harness.db, jun.id, [
			{ id: partnershipId, name: 'Ada', image: null }
		]);
		expect(junsWidget.ready).toEqual([
			expect.objectContaining({ title: 'Ada assigned this', context: 'Ada' })
		]);
	});
});
