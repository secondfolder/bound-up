import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskInput } from '../tasks';
import { createTestDb, type TestDb } from '../testing/db';
import { defined } from '../testing/defined';
import {
	createTestInvite,
	createTestPartnership,
	createTestPartnershipTask,
	createTestSelfTask,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readPartnershipRewardCreditRow,
	readPartnershipTaskCompletionRows,
	readPartnershipTaskRow,
	readSelfRewardCreditRow,
	readSelfTaskCompletionRows,
	readSelfTaskRow,
	type TestUser
} from '../testing/fixtures';
import { testPartnerView } from '../testing/names';
import { partnerships, selfTasks } from './db/schema';
import {
	completePartnershipTask,
	completeSelfTask,
	createPartnershipTask,
	createSelfTask,
	getHomeTasksWidget,
	getPartnershipTasksPage,
	getPartnershipTasksWidget,
	getSelfTaskForUser,
	getSelfTasksSection,
	listHomePartnerTaskSections,
	requireTaskMembership,
	updatePartnershipTask,
	updateSelfTask
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

/** A whole task write, sealed under `vaultId`, as the editor posts it. */
function taskInput(
	vaultId: string,
	overrides: Partial<Omit<TaskInput, 'content'>> & {
		ciphertext?: string;
		payloadVersion?: number;
		completionMessageCount?: number;
		timezoneOwnerUserId: string;
	}
): TaskInput {
	return {
		active: overrides.active ?? true,
		creditsAwarded: overrides.creditsAwarded ?? 1,
		schedule: overrides.schedule ?? { mode: 'one-off' },
		timezoneOwnerUserId: overrides.timezoneOwnerUserId,
		content: {
			vaultId,
			ciphertext: overrides.ciphertext ?? fakeSealed('task'),
			payloadVersion: overrides.payloadVersion ?? 1,
			completionMessageCount: overrides.completionMessageCount ?? 1
		}
	};
}

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
		const { id, ciphertext } = await createTestSelfTask(harness.db, ada, {
			completionMessageCount: 2
		});
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);

		await expect(readSelfTaskRow(harness.db, id)).resolves.toMatchObject({
			ownerId: ada.id,
			timezoneOwnerUserId: ada.id,
			ciphertext,
			vaultId,
			completionMessageCount: 2
		});

		const section = await getSelfTasksSection(harness.db, ada.id, ada.timezone);
		expect(section.tasks).toContainEqual(
			expect.objectContaining({
				id,
				sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 },
				revision: 0,
				canComplete: true,
				timeZoneNote: null
			})
		);
	});

	it('keeps no plaintext on a sealed row, and hands back none', async () => {
		const { id } = await createTestSelfTask(harness.db, ada);

		await expect(readSelfTaskRow(harness.db, id)).resolves.toMatchObject({
			title: '',
			description: null,
			completionMessages: []
		});
		const task = defined(await getSelfTaskForUser(harness.db, ada.id, ada.timezone, id), 'task');
		expect(task).toMatchObject({ title: '', description: null, completionMessages: [] });
	});

	it('completes a one-off self task, awards credits, and deactivates it', async () => {
		const { id } = await createTestSelfTask(harness.db, ada, { creditsAwarded: 4 });

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

	it('snapshots the task as sealed at completion time, with a message index in range', async () => {
		const { id, ciphertext } = await createTestSelfTask(harness.db, ada, {
			completionMessageCount: 3
		});
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);

		await expect(completeSelfTask(harness.db, ada.id, ada.timezone, id)).resolves.toEqual({
			ok: true
		});

		// Edited afterwards: the completion keeps what it was completed as.
		await expect(
			updateSelfTask(harness.db, ada.id, ada.timezone, id, {
				...taskInput(vaultId, {
					ciphertext: fakeSealed('edited'),
					timezoneOwnerUserId: ada.id
				}),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: true });

		const [row] = await readSelfTaskCompletionRows(harness.db, ada.id);
		const completion = defined(row, 'completion row');
		expect(completion).toMatchObject({
			snapshotCiphertext: ciphertext,
			snapshotVaultId: vaultId,
			snapshotVersion: 1,
			snapshotRecordId: id,
			taskTitle: '',
			taskDescription: null,
			completionMessage: null
		});
		const index = defined(completion.completionMessageIndex, 'completion message index');
		expect(index).toBeGreaterThanOrEqual(0);
		expect(index).toBeLessThan(3);

		const section = await getSelfTasksSection(harness.db, ada.id, ada.timezone);
		expect(section.completions).toEqual([
			expect.objectContaining({
				sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 },
				completionMessageIndex: index,
				taskTitle: '',
				completionMessage: null
			})
		]);
	});

	it('records no message index for a task with no completion messages', async () => {
		const { id } = await createTestSelfTask(harness.db, ada, { completionMessageCount: 0 });

		await completeSelfTask(harness.db, ada.id, ada.timezone, id);

		const [row] = await readSelfTaskCompletionRows(harness.db, ada.id);
		expect(defined(row, 'completion row').completionMessageIndex).toBeNull();
	});
});

describe('self task writes', () => {
	it('refuses a create naming an id that is already taken, and changes nothing', async () => {
		const { id, ciphertext } = await createTestSelfTask(harness.db, ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);

		await expect(
			createSelfTask(
				harness.db,
				ada.id,
				ada.timezone,
				id,
				taskInput(vaultId, { timezoneOwnerUserId: ada.id })
			)
		).resolves.toEqual({ ok: false, reason: 'id-taken' });
		await expect(readSelfTaskRow(harness.db, id)).resolves.toMatchObject({ ciphertext });
	});

	it('bumps the revision on an update made at the current revision', async () => {
		const { id } = await createTestSelfTask(harness.db, ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const ciphertext = fakeSealed('v1');

		await expect(
			updateSelfTask(harness.db, ada.id, ada.timezone, id, {
				...taskInput(vaultId, {
					ciphertext,
					timezoneOwnerUserId: ada.id,
					completionMessageCount: 4
				}),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: true });

		await expect(readSelfTaskRow(harness.db, id)).resolves.toMatchObject({
			revision: 1,
			ciphertext,
			completionMessageCount: 4
		});
	});

	it('refuses an update made at a stale revision, and keeps the newer content', async () => {
		const { id } = await createTestSelfTask(harness.db, ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const newer = fakeSealed('newer');

		await updateSelfTask(harness.db, ada.id, ada.timezone, id, {
			...taskInput(vaultId, { ciphertext: newer, timezoneOwnerUserId: ada.id }),
			expectedRevision: 0
		});

		await expect(
			updateSelfTask(harness.db, ada.id, ada.timezone, id, {
				...taskInput(vaultId, { ciphertext: fakeSealed('stale'), timezoneOwnerUserId: ada.id }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'conflict' });
		await expect(readSelfTaskRow(harness.db, id)).resolves.toMatchObject({
			revision: 1,
			ciphertext: newer
		});
	});

	it("reports not-found, not conflict, for someone else's task", async () => {
		const { id } = await createTestSelfTask(harness.db, jun);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);

		await expect(
			updateSelfTask(harness.db, ada.id, ada.timezone, id, {
				...taskInput(vaultId, { timezoneOwnerUserId: ada.id }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'not-found' });
	});

	it("refuses content sealed under another scope's vault", async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
		const partnershipVault = await ensureTestPartnershipVault(harness.db, partnershipId);
		const junsVault = await ensureTestSelfVault(harness.db, jun.id);
		await ensureTestSelfVault(harness.db, ada.id);

		for (const vaultId of [partnershipVault, junsVault]) {
			await expect(
				createSelfTask(
					harness.db,
					ada.id,
					ada.timezone,
					crypto.randomUUID(),
					taskInput(vaultId, { timezoneOwnerUserId: ada.id })
				)
			).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
		}

		const { id, ciphertext } = await createTestSelfTask(harness.db, ada);
		await expect(
			updateSelfTask(harness.db, ada.id, ada.timezone, id, {
				...taskInput(partnershipVault, { timezoneOwnerUserId: ada.id }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
		await expect(readSelfTaskRow(harness.db, id)).resolves.toMatchObject({ ciphertext });
	});

	it('refuses a write while the owner has no vault at all', async () => {
		await expect(
			createSelfTask(
				harness.db,
				ada.id,
				ada.timezone,
				crypto.randomUUID(),
				taskInput(crypto.randomUUID(), { timezoneOwnerUserId: ada.id })
			)
		).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
	});

	it.each([
		['an empty ciphertext', { ciphertext: '' }],
		['a ciphertext not in the sealed format', { ciphertext: 'not sealed at all' }],
		['a ciphertext over the cap', { ciphertext: `sb1.${'A'.repeat(32 * 1024)}` }],
		['an unknown payload version', { payloadVersion: 99 }],
		['a negative message count', { completionMessageCount: -1 }],
		['a message count over the limit', { completionMessageCount: 21 }],
		['a fractional message count', { completionMessageCount: 1.5 }]
	])('refuses %s', async (_label, overrides) => {
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const id = crypto.randomUUID();

		await expect(
			createSelfTask(
				harness.db,
				ada.id,
				ada.timezone,
				id,
				taskInput(vaultId, { timezoneOwnerUserId: ada.id, ...overrides })
			)
		).resolves.toEqual({ ok: false, reason: 'bad-content' });
		await expect(readSelfTaskRow(harness.db, id)).resolves.toBeUndefined();
	});
});

describe('partnership tasks', () => {
	it('lets the controller create tasks and rejects an invalid timezone owner', async () => {
		const controlled = (await createTestPartnership(harness.db, ada, jun, { control: 'me' })).id;
		const vaultId = await ensureTestPartnershipVault(harness.db, controlled);
		const id = crypto.randomUUID();
		const ciphertext = fakeSealed('partner');

		await expect(
			createPartnershipTask(
				harness.db,
				controlled,
				ada.id,
				ada.timezone,
				id,
				taskInput(vaultId, { ciphertext, creditsAwarded: 3, timezoneOwnerUserId: jun.id })
			)
		).resolves.toEqual({ ok: true, id });
		await expect(readPartnershipTaskRow(harness.db, id)).resolves.toMatchObject({
			ciphertext,
			vaultId,
			revision: 0,
			title: '',
			description: null,
			completionMessages: []
		});

		const stranger = await createTestUser(harness.db, { name: 'Stranger' });
		await expect(
			createPartnershipTask(
				harness.db,
				controlled,
				ada.id,
				ada.timezone,
				crypto.randomUUID(),
				taskInput(vaultId, { timezoneOwnerUserId: stranger.id })
			)
		).resolves.toEqual({ ok: false, reason: 'bad-timezone-owner' });
	});

	it('rejects creation by the non-controller under one-sided control', async () => {
		const controlled = (await createTestPartnership(harness.db, ada, jun, { control: 'me' })).id;
		const vaultId = await ensureTestPartnershipVault(harness.db, controlled);

		await expect(
			createPartnershipTask(
				harness.db,
				controlled,
				jun.id,
				jun.timezone,
				crypto.randomUUID(),
				taskInput(vaultId, { timezoneOwnerUserId: ada.id })
			)
		).resolves.toEqual({ ok: false, reason: 'forbidden' });
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
				createPartnershipTask(
					harness.db,
					partnershipId,
					ada.id,
					ada.timezone,
					crypto.randomUUID(),
					taskInput(vaultId, { timezoneOwnerUserId: ada.id })
				)
			).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
		}

		const { id, ciphertext } = await createTestPartnershipTask(harness.db, partnershipId, ada);
		await expect(
			updatePartnershipTask(harness.db, partnershipId, ada.id, ada.timezone, id, {
				...taskInput(otherVault, { timezoneOwnerUserId: ada.id }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
		await expect(readPartnershipTaskRow(harness.db, id)).resolves.toMatchObject({ ciphertext });
	});

	it('refuses a malformed ciphertext', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);

		await expect(
			createPartnershipTask(
				harness.db,
				partnershipId,
				ada.id,
				ada.timezone,
				crypto.randomUUID(),
				taskInput(vaultId, { ciphertext: 'plain title', timezoneOwnerUserId: ada.id })
			)
		).resolves.toEqual({ ok: false, reason: 'bad-content' });
	});

	it('updates at the current revision and refuses a stale one', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'mix' }))
			.id;
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const { id } = await createTestPartnershipTask(harness.db, partnershipId, ada);
		const newer = fakeSealed('newer');

		await expect(
			updatePartnershipTask(harness.db, partnershipId, ada.id, ada.timezone, id, {
				...taskInput(vaultId, { ciphertext: newer, timezoneOwnerUserId: ada.id }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: true });
		await expect(
			updatePartnershipTask(harness.db, partnershipId, ada.id, ada.timezone, id, {
				...taskInput(vaultId, { ciphertext: fakeSealed('stale'), timezoneOwnerUserId: ada.id }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'conflict' });

		await expect(readPartnershipTaskRow(harness.db, id)).resolves.toMatchObject({
			revision: 1,
			ciphertext: newer
		});
		const page = defined(
			await getPartnershipTasksPage(harness.db, partnershipId, ada.id, ada.timezone),
			'page'
		);
		expect(page.tasks).toContainEqual(
			expect.objectContaining({
				id,
				revision: 1,
				sealed: { recordId: id, vaultId, ciphertext: newer, payloadVersion: 1 }
			})
		);
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
		const { id, ciphertext } = await createTestPartnershipTask(harness.db, claimantView, jun, {
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
				// Ada is the inviter, so the source is read from her end.
				names: expect.objectContaining({ partnershipId: claimantView, role: 'inviter' }),
				canManageTasks: false,
				canCompleteTasks: true,
				counterpartUserId: jun.id,
				counterpartTimezone: jun.timezone
			}
		});
		expect(page?.tasks).toContainEqual(
			expect.objectContaining({
				id,
				sealed: expect.objectContaining({ recordId: id, ciphertext }),
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
			creditsAwarded: 5
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

	it("snapshots the author's sealed task when the other member completes it", async () => {
		const claimantView = (await createTestPartnership(harness.db, ada, jun, { control: 'them' }))
			.id;
		const vaultId = await ensureTestPartnershipVault(harness.db, claimantView);
		const { id, ciphertext } = await createTestPartnershipTask(harness.db, claimantView, jun, {
			completionMessageCount: 2
		});

		await completePartnershipTask(harness.db, {
			partnershipId: claimantView,
			taskId: id,
			userId: ada.id,
			viewerTimezone: ada.timezone
		});

		const [row] = await readPartnershipTaskCompletionRows(harness.db, claimantView);
		const completion = defined(row, 'completion row');
		expect(completion).toMatchObject({
			completedByUserId: ada.id,
			createdByUserId: jun.id,
			snapshotCiphertext: ciphertext,
			snapshotVaultId: vaultId,
			snapshotVersion: 1,
			snapshotRecordId: id,
			taskTitle: '',
			taskDescription: null,
			completionMessage: null
		});
		const index = defined(completion.completionMessageIndex, 'completion message index');
		expect(index).toBeGreaterThanOrEqual(0);
		expect(index).toBeLessThan(2);

		const page = defined(
			await getPartnershipTasksPage(harness.db, claimantView, ada.id, ada.timezone),
			'page'
		);
		expect(page.completions).toEqual([
			expect.objectContaining({
				mine: true,
				createdByMe: false,
				sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 },
				completionMessageIndex: index
			})
		]);
	});

	it('records no message index for a partnership task with no completion messages', async () => {
		const claimantView = (await createTestPartnership(harness.db, ada, jun, { control: 'them' }))
			.id;
		const { id } = await createTestPartnershipTask(harness.db, claimantView, jun, {
			completionMessageCount: 0
		});

		await completePartnershipTask(harness.db, {
			partnershipId: claimantView,
			taskId: id,
			userId: ada.id,
			viewerTimezone: ada.timezone
		});

		const [row] = await readPartnershipTaskCompletionRows(harness.db, claimantView);
		expect(defined(row, 'completion row').completionMessageIndex).toBeNull();
	});

	it('blocks the author from completing their own task under shared control', async () => {
		const shared = (await createTestPartnership(harness.db, ada, jun, { control: 'mix' })).id;
		const { id } = await createTestPartnershipTask(harness.db, shared, ada);

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
		const fromJun = await createTestPartnershipTask(harness.db, shared, jun);
		const fromAda = await createTestPartnershipTask(harness.db, shared, ada);

		await harness.db
			.update(partnerships)
			.set({ control: 'inviter' })
			.where(and(eq(partnerships.id, shared), eq(partnerships.inviterId, ada.id)));

		const page = await getPartnershipTasksPage(harness.db, shared, ada.id, ada.timezone);
		expect(page?.tasks).toContainEqual(
			expect.objectContaining({
				id: fromAda.id,
				sealed: expect.objectContaining({ ciphertext: fromAda.ciphertext })
			})
		);
		expect(page?.tasks).not.toContainEqual(expect.objectContaining({ id: fromJun.id }));
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

		const junTask = await createTestPartnershipTask(harness.db, withJun, jun);
		const casTask = await createTestPartnershipTask(harness.db, withCas, cas);
		await createTestPartnershipTask(harness.db, withCas, ada);
		await createTestPartnershipTask(harness.db, withPat, ada);

		const sections = await listHomePartnerTaskSections(harness.db, ada.id, ada.timezone, [
			testPartnerView(withCas, 'Cas'),
			testPartnerView(withJun, 'Jun'),
			testPartnerView(withPat, 'Pat')
		]);

		// The names are passed through untouched: the server cannot read them.
		expect(sections.map((section) => section.names)).toEqual([
			testPartnerView(withCas, 'Cas').names,
			testPartnerView(withJun, 'Jun').names
		]);
		expect(sections[0]?.tasks).toContainEqual(
			expect.objectContaining({
				id: casTask.id,
				sealed: expect.objectContaining({ ciphertext: casTask.ciphertext }),
				createdByMe: false
			})
		);
		expect(sections[0]?.tasks).toHaveLength(1);
		expect(sections[1]?.tasks).toContainEqual(
			expect.objectContaining({
				id: junTask.id,
				sealed: expect.objectContaining({ ciphertext: junTask.ciphertext }),
				createdByMe: false
			})
		);
	});
});

describe('task widgets', () => {
	it('splits ready from waiting, and never counts an inactive task', async () => {
		const ready = await createTestSelfTask(harness.db, ada, { creditsAwarded: 2 });
		await createTestSelfTask(harness.db, ada, { active: false });

		const widget = await getHomeTasksWidget(harness.db, ada.id, []);
		expect(widget).toMatchObject({
			viewerActs: true,
			readyCount: 1,
			waitingCount: 0,
			activeCount: 1,
			ready: [{ id: ready.id, note: '+2', context: null }]
		});
	});

	it('carries each row as a sealed ref, with no plaintext title', async () => {
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const { id, ciphertext } = await createTestSelfTask(harness.db, ada);

		const widget = await getHomeTasksWidget(harness.db, ada.id, []);
		expect(widget.ready).toEqual([
			{
				id,
				title: '',
				kind: 'task',
				sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 },
				note: '+2',
				context: null
			}
		]);
	});

	it('counts a task whose schedule has not come round yet as waiting, not ready', async () => {
		const { id } = await createTestSelfTask(harness.db, ada);
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
		const adas = await createTestPartnershipTask(harness.db, partnershipId, ada);
		const juns = await createTestPartnershipTask(harness.db, partnershipId, jun);

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
			ready: [{ id: juns.id, sealed: expect.objectContaining({ ciphertext: juns.ciphertext }) }],
			readyCount: 1
		});

		const junsWidget = await getPartnershipTasksWidget(
			harness.db,
			partnershipId,
			jun.id,
			jun.timezone
		);
		expect(junsWidget).toMatchObject({
			ready: [{ id: adas.id, sealed: expect.objectContaining({ ciphertext: adas.ciphertext }) }],
			readyCount: 1
		});
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
		const own = await createTestSelfTask(harness.db, ada);
		const assigned = await createTestPartnershipTask(harness.db, partnershipId, jun);

		const widget = await getHomeTasksWidget(harness.db, ada.id, [
			testPartnerView(partnershipId, 'Jun')
		]);

		expect(widget.activeCount).toBe(2);
		expect(widget.ready).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: own.id,
					sealed: expect.objectContaining({ ciphertext: own.ciphertext }),
					context: null
				}),
				// Attributed, because two partners can name a task the same thing.
				expect.objectContaining({
					id: assigned.id,
					sealed: expect.objectContaining({ ciphertext: assigned.ciphertext }),
					context: testPartnerView(partnershipId, 'Jun').names
				})
			])
		);
	});

	it('leaves out a partnership you manage — that side is the partner page', async () => {
		// Ada controls, so the task she wrote is Jun's to complete, not hers.
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'me' })).id;
		const { id } = await createTestPartnershipTask(harness.db, partnershipId, ada);

		const widget = await getHomeTasksWidget(harness.db, ada.id, [
			testPartnerView(partnershipId, 'Jun')
		]);
		expect(widget).toMatchObject({ activeCount: 0, ready: [] });

		// And it does show up for the side that has to do it.
		const junsWidget = await getHomeTasksWidget(harness.db, jun.id, [
			testPartnerView(partnershipId, 'Ada')
		]);
		expect(junsWidget.ready).toEqual([
			expect.objectContaining({ id, context: testPartnerView(partnershipId, 'Ada').names })
		]);
	});
});
