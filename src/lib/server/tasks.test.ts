import { eq } from 'drizzle-orm';
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
	setTestPartnershipControl,
	type TestUser
} from '../testing/fixtures';
import { testPartnerView } from '../testing/names';
import { selfRewardCredits, selfTaskCompletions, selfTasks } from './db/schema';
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
	UNDO_WINDOW_MS,
	undoPartnershipTaskCompletion,
	undoSelfTaskCompletion,
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

	it('hands back the sealed record, and nothing in its place', async () => {
		const { id, ciphertext } = await createTestSelfTask(harness.db, ada);

		const task = defined(await getSelfTaskForUser(harness.db, ada.id, ada.timezone, id), 'task');
		expect(task.sealed).toMatchObject({ recordId: id, ciphertext });
		for (const plaintext of ['title', 'description', 'completionMessages']) {
			expect(task).not.toHaveProperty(plaintext);
		}
	});

	it('completes a one-off self task, awards credits, and deactivates it', async () => {
		const { id } = await createTestSelfTask(harness.db, ada, { creditsAwarded: 4 });

		await expect(completeSelfTask(harness.db, ada.id, ada.timezone, id)).resolves.toEqual({
			ok: true,
			completionId: expect.any(String)
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
			ok: true,
			completionId: expect.any(String)
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
			snapshotRecordId: id
		});
		const index = defined(completion.completionMessageIndex, 'completion message index');
		expect(index).toBeGreaterThanOrEqual(0);
		expect(index).toBeLessThan(3);

		const section = await getSelfTasksSection(harness.db, ada.id, ada.timezone);
		expect(section.completions).toEqual([
			expect.objectContaining({
				sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 },
				completionMessageIndex: index
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
			revision: 0
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
		).resolves.toEqual({ ok: true, completionId: expect.any(String) });

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
			snapshotRecordId: id
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

		await setTestPartnershipControl(harness.db, shared, 'inviter');

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

/** Completes a self task and hands back the completion's id, failing loudly if it did not complete. */
async function completeSelf(taskId: string, now?: Date): Promise<string> {
	const result = await completeSelfTask(harness.db, ada.id, ada.timezone, taskId, now);
	if (!result.ok) {
		throw new Error(`could not complete: ${result.reason}`);
	}
	return result.completionId;
}

describe('rolling window counts', () => {
	const threeAWeek = {
		mode: 'rolling-window',
		limit: { completions: 3, every: 1, unit: 'week' }
	} as const;

	it("counts the completions still inside a self task's window", async () => {
		const { id } = await createTestSelfTask(harness.db, ada, { schedule: threeAWeek });
		const plain = await createTestSelfTask(harness.db, ada, { schedule: { mode: 'one-off' } });
		await completeSelf(id, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));
		await completeSelf(id);
		await completeSelf(id);

		const section = await getSelfTasksSection(harness.db, ada.id, ada.timezone);
		const byId = new Map(section.tasks.map((task) => [task.id, task]));
		expect(byId.get(id)?.windowCompletions).toBe(2);
		expect(byId.get(plain.id)?.windowCompletions).toBeNull();
	});

	it('counts them for partnership tasks, on the partner page and on home', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'them' }))
			.id;
		const { id } = await createTestPartnershipTask(harness.db, partnershipId, jun, {
			schedule: threeAWeek
		});
		await completePartnershipTask(harness.db, {
			partnershipId,
			taskId: id,
			userId: ada.id,
			viewerTimezone: ada.timezone
		});

		const page = defined(
			await getPartnershipTasksPage(harness.db, partnershipId, ada.id, ada.timezone),
			'partner page'
		);
		expect(page.tasks.find((task) => task.id === id)?.windowCompletions).toBe(1);

		const [section] = await listHomePartnerTaskSections(harness.db, ada.id, ada.timezone, [
			testPartnerView(partnershipId, 'Jun')
		]);
		expect(section?.tasks.find((task) => task.id === id)?.windowCompletions).toBe(1);
	});
});

describe('completing adds credits in SQL', () => {
	it('adds to a balance that is already there rather than replacing it', async () => {
		await harness.db
			.insert(selfRewardCredits)
			.values({ ownerId: ada.id, credits: 10, createdAt: new Date(), updatedAt: new Date() });
		const { id } = await createTestSelfTask(harness.db, ada, { creditsAwarded: 3 });
		await completeSelf(id);
		await expect(readSelfRewardCreditRow(harness.db, ada.id)).resolves.toMatchObject({
			credits: 13
		});
	});
});

describe('undoing a self task completion', () => {
	it('records the task as it was on the completion', async () => {
		const { id } = await createTestSelfTask(harness.db, ada);
		await completeSelf(id);
		const [row] = await readSelfTaskCompletionRows(harness.db, ada.id);
		expect(row).toMatchObject({
			previousActive: true,
			previousNextEligibleAt: null,
			previousLastCompletedAt: null
		});
	});

	it('puts a one-off back as it was, and takes the credits back', async () => {
		const { id } = await createTestSelfTask(harness.db, ada, { creditsAwarded: 4 });
		const completionId = await completeSelf(id);

		await expect(undoSelfTaskCompletion(harness.db, ada.id, completionId)).resolves.toEqual({
			ok: true
		});
		await expect(readSelfTaskRow(harness.db, id)).resolves.toMatchObject({
			active: true,
			completedCount: 0,
			lastCompletedAt: null,
			nextEligibleAt: null
		});
		await expect(readSelfRewardCreditRow(harness.db, ada.id)).resolves.toMatchObject({
			credits: 0
		});
		await expect(readSelfTaskCompletionRows(harness.db, ada.id)).resolves.toEqual([]);
	});

	it("restores a scheduled task's next occurrence even after its schedule was edited", async () => {
		const schedule = {
			mode: 'scheduled',
			anchorLocal: '2026-01-05T09:00',
			frequency: 'day',
			interval: 1,
			end: { kind: 'never' }
		} as const;
		const { id } = await createTestSelfTask(harness.db, ada, { schedule });
		const before = defined(await readSelfTaskRow(harness.db, id), 'task').nextEligibleAt;
		const completionId = await completeSelf(id);
		const vaultId = defined((await readSelfTaskRow(harness.db, id))?.vaultId, 'vault');
		await updateSelfTask(harness.db, ada.id, ada.timezone, id, {
			...taskInput(vaultId, {
				timezoneOwnerUserId: ada.id,
				schedule: { ...schedule, frequency: 'week' }
			}),
			expectedRevision: 0
		});

		await undoSelfTaskCompletion(harness.db, ada.id, completionId);
		expect(defined(await readSelfTaskRow(harness.db, id), 'task').nextEligibleAt).toEqual(before);
	});

	it('refuses anyone but the person who completed it', async () => {
		const { id } = await createTestSelfTask(harness.db, ada);
		const completionId = await completeSelf(id);
		await expect(undoSelfTaskCompletion(harness.db, jun.id, completionId)).resolves.toEqual({
			ok: false,
			reason: 'not-yours'
		});
		await expect(undoSelfTaskCompletion(harness.db, ada.id, crypto.randomUUID())).resolves.toEqual({
			ok: false,
			reason: 'not-found'
		});
	});

	it('refuses all but the newest completion of the task', async () => {
		const { id } = await createTestSelfTask(harness.db, ada, {
			schedule: { mode: 'rolling-window', limit: null }
		});
		const first = await completeSelf(id, new Date(Date.now() - 1000));
		const second = await completeSelf(id);
		await expect(undoSelfTaskCompletion(harness.db, ada.id, first)).resolves.toEqual({
			ok: false,
			reason: 'not-latest'
		});
		await expect(undoSelfTaskCompletion(harness.db, ada.id, second)).resolves.toEqual({
			ok: true
		});
	});

	it('refuses once the undo window has passed', async () => {
		const { id } = await createTestSelfTask(harness.db, ada);
		const completedAt = new Date();
		const completionId = await completeSelf(id, completedAt);
		const later = new Date(completedAt.getTime() + UNDO_WINDOW_MS + 1);
		await expect(undoSelfTaskCompletion(harness.db, ada.id, completionId, later)).resolves.toEqual({
			ok: false,
			reason: 'too-old'
		});
	});

	it('refuses a completion recorded before undo existed', async () => {
		const { id } = await createTestSelfTask(harness.db, ada);
		const completionId = await completeSelf(id);
		await harness.db
			.update(selfTaskCompletions)
			.set({ previousActive: null })
			.where(eq(selfTaskCompletions.id, completionId));
		await expect(undoSelfTaskCompletion(harness.db, ada.id, completionId)).resolves.toEqual({
			ok: false,
			reason: 'not-undoable'
		});
	});

	it('refuses when the credits it gave have been spent, and changes nothing', async () => {
		const { id } = await createTestSelfTask(harness.db, ada, { creditsAwarded: 4 });
		const completionId = await completeSelf(id);
		await harness.db
			.update(selfRewardCredits)
			.set({ credits: 1 })
			.where(eq(selfRewardCredits.ownerId, ada.id));
		await expect(undoSelfTaskCompletion(harness.db, ada.id, completionId)).resolves.toEqual({
			ok: false,
			reason: 'credits-spent'
		});
		await expect(readSelfTaskRow(harness.db, id)).resolves.toMatchObject({ active: false });
		await expect(readSelfTaskCompletionRows(harness.db, ada.id)).resolves.toHaveLength(1);
	});
});

describe('undoing a partnership task completion', () => {
	async function completed() {
		const partnershipId = (await createTestPartnership(harness.db, ada, jun, { control: 'them' }))
			.id;
		const { id } = await createTestPartnershipTask(harness.db, partnershipId, jun, {
			creditsAwarded: 5
		});
		const result = await completePartnershipTask(harness.db, {
			partnershipId,
			taskId: id,
			userId: ada.id,
			viewerTimezone: ada.timezone
		});
		if (!result.ok) {
			throw new Error(`could not complete: ${result.reason}`);
		}
		return { partnershipId, taskId: id, completionId: result.completionId };
	}

	it("puts the task back and takes the completer's credits back", async () => {
		const { partnershipId, taskId, completionId } = await completed();
		await expect(
			undoPartnershipTaskCompletion(harness.db, {
				partnershipId,
				completionId,
				userId: ada.id,
				viewerTimezone: ada.timezone
			})
		).resolves.toEqual({ ok: true });
		await expect(readPartnershipTaskRow(harness.db, taskId)).resolves.toMatchObject({
			active: true,
			completedCount: 0
		});
		await expect(
			readPartnershipRewardCreditRow(harness.db, partnershipId, ada.id)
		).resolves.toMatchObject({ credits: 0 });
		await expect(readPartnershipTaskCompletionRows(harness.db, partnershipId)).resolves.toEqual([]);
	});

	it('refuses the partner who did not complete it', async () => {
		const { partnershipId, completionId } = await completed();
		await expect(
			undoPartnershipTaskCompletion(harness.db, {
				partnershipId,
				completionId,
				userId: jun.id,
				viewerTimezone: jun.timezone
			})
		).resolves.toEqual({ ok: false, reason: 'not-yours' });
	});

	it('refuses someone outside the partnership, and a completion from another one', async () => {
		const { partnershipId, completionId } = await completed();
		const eve = await createTestUser(harness.db, { name: 'Eve' });
		await expect(
			undoPartnershipTaskCompletion(harness.db, {
				partnershipId,
				completionId,
				userId: eve.id,
				viewerTimezone: eve.timezone
			})
		).resolves.toEqual({ ok: false, reason: 'not-a-member' });

		const other = (await createTestPartnership(harness.db, ada, eve, { control: 'them' })).id;
		await expect(
			undoPartnershipTaskCompletion(harness.db, {
				partnershipId: other,
				completionId,
				userId: ada.id,
				viewerTimezone: ada.timezone
			})
		).resolves.toEqual({ ok: false, reason: 'not-found' });
	});
});
