import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskInput } from '../tasks';
import { createTestDb, type TestDb } from '../testing/db';
import { defined } from '../testing/defined';
import {
	completeTestTask,
	createTestInvite,
	createTestPartnership,
	createTestTask,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readBalanceRow,
	readTaskCompletionRows,
	readTaskRow,
	setTestBalance,
	setTestPartnershipControl,
	type TestUser,
	testSoloSpace
} from '../testing/fixtures';
import { testPartnerView } from '../testing/names';
import { rewardBalances, taskCompletions, tasks } from './db/schema';
import {
	completeTask,
	createTask,
	getTaskForViewer,
	getTasksWidget,
	listTaskCompletions,
	listTasks,
	UNDO_WINDOW_MS,
	undoTaskCompletion,
	updateTask,
	updateTaskContent
} from './tasks';

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;
/** Ada's solo space, which every account has from the moment it exists. */
let adaSolo: string;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada', timezone: 'Europe/London' });
	jun = await createTestUser(harness.db, { name: 'Jun', timezone: 'America/New_York' });
	adaSolo = await testSoloSpace(harness.db, ada.id);
});

afterEach(() => {
	vi.useRealTimers();
	harness.close();
});

/** A whole task write, sealed under `vaultId`, as the editor posts it. */
function taskInput(
	vaultId: string,
	overrides: Partial<Omit<TaskInput, 'content'>> & {
		ciphertext?: string;
		payloadVersion?: number;
		completionMessageCount?: number;
	} = {}
): TaskInput {
	return {
		active: overrides.active ?? true,
		creditsAwarded: overrides.creditsAwarded ?? 1,
		schedule: overrides.schedule ?? { mode: 'one-off' },
		timezoneOwnerUserId: overrides.timezoneOwnerUserId ?? ada.id,
		content: {
			vaultId,
			ciphertext: overrides.ciphertext ?? fakeSealed('task'),
			payloadVersion: overrides.payloadVersion ?? 1,
			completionMessageCount: overrides.completionMessageCount ?? 1
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

/** Completes a task as `viewer`, failing loudly if it did not complete; the completion's id. */
async function complete(viewer: TestUser, taskId: string, now?: Date): Promise<string> {
	return await completeTestTask(harness.db, viewer, taskId, now);
}

const byText = (a: string, b: string) => a.localeCompare(b);
const ids = (list: { id: string }[]) => list.map((item) => item.id).sort(byText);

describe('a solo space', () => {
	it('creates a task for its owner and lists it under To do, never Set for others', async () => {
		const { id, ciphertext } = await createTestTask(harness.db, adaSolo, ada, {
			completionMessageCount: 2
		});
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);

		await expect(readTaskRow(harness.db, id)).resolves.toMatchObject({
			spaceId: adaSolo,
			createdByUserId: ada.id,
			assigneeUserId: ada.id,
			timezoneOwnerUserId: ada.id,
			ciphertext,
			vaultId,
			completionMessageCount: 2
		});

		const list = await listTasks(harness.db, ada, [adaSolo]);
		expect(list.setForOthers).toEqual([]);
		expect(list.toDo).toEqual([
			expect.objectContaining({
				id,
				spaceId: adaSolo,
				sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 },
				revision: 0,
				createdByMe: true,
				assigneeUserId: ada.id,
				canManage: true,
				canComplete: true,
				timeZoneNote: null
			})
		]);
		expect(list.spaces).toEqual([
			{ id: adaSolo, kind: 'solo', canManage: true, viewerActs: true, others: [] }
		]);
		expect(list.balances).toEqual([
			{ spaceId: adaSolo, userId: ada.id, mine: true, credits: 0, canSet: true }
		]);
	});

	it('hands back the sealed record, and nothing in its place', async () => {
		const { id, ciphertext } = await createTestTask(harness.db, adaSolo, ada);

		const found = defined(await getTaskForViewer(harness.db, ada, id), 'task');
		expect(found.task.sealed).toMatchObject({ recordId: id, ciphertext });
		expect(found.space).toMatchObject({ id: adaSolo, kind: 'solo' });
		for (const plaintext of ['title', 'description', 'completionMessages']) {
			expect(found.task).not.toHaveProperty(plaintext);
		}
	});

	it("keeps a solo task's dates in its owner's time, whoever the form names", async () => {
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const id = crypto.randomUUID();

		await expect(
			createTask(harness.db, ada, adaSolo, id, taskInput(vaultId, { timezoneOwnerUserId: jun.id }))
		).resolves.toEqual({ ok: true, id });
		await expect(readTaskRow(harness.db, id)).resolves.toMatchObject({
			timezoneOwnerUserId: ada.id
		});
	});

	it('completes a one-off task, awards credits, and deactivates it', async () => {
		const { id } = await createTestTask(harness.db, adaSolo, ada, { creditsAwarded: 4 });

		await expect(completeTask(harness.db, ada, id)).resolves.toEqual({
			ok: true,
			completionId: expect.any(String)
		});
		await expect(readBalanceRow(harness.db, adaSolo, ada.id)).resolves.toMatchObject({
			credits: 4
		});
		await expect(readTaskRow(harness.db, id)).resolves.toMatchObject({
			active: false,
			completedCount: 1
		});

		const found = defined(await getTaskForViewer(harness.db, ada, id), 'task');
		expect(found.task).toMatchObject({ canComplete: false, active: false });
		await expect(completeTask(harness.db, ada, id)).resolves.toEqual({
			ok: false,
			reason: 'inactive'
		});
	});

	it('refuses a completion before the schedule comes round', async () => {
		const { id } = await createTestTask(harness.db, adaSolo, ada, {
			schedule: { mode: 'after-completion', every: 1, unit: 'day' }
		});
		await complete(ada, id);

		// After-completion: the next one opens a day later, so a second tick now is early.
		const task = defined(await readTaskRow(harness.db, id), 'task');
		expect(defined(task.nextEligibleAt, 'next eligible').getTime()).toBeGreaterThan(Date.now());
		await expect(completeTask(harness.db, ada, id)).resolves.toEqual({
			ok: false,
			reason: 'not-ready'
		});
	});

	it('snapshots the task as sealed at completion time, with a message index in range', async () => {
		const { id, ciphertext } = await createTestTask(harness.db, adaSolo, ada, {
			completionMessageCount: 3
		});
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		await complete(ada, id);

		// Edited afterwards: the completion keeps what it was completed as.
		await expect(
			updateTask(harness.db, ada, id, {
				...taskInput(vaultId, { ciphertext: fakeSealed('edited') }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: true });

		const [row] = await readTaskCompletionRows(harness.db, adaSolo);
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

		await expect(listTaskCompletions(harness.db, ada.id, [adaSolo])).resolves.toEqual([
			expect.objectContaining({
				spaceId: adaSolo,
				sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 },
				completionMessageIndex: index,
				mine: true,
				createdByMe: true
			})
		]);
	});

	it('records no message index for a task with no completion messages', async () => {
		const { id } = await createTestTask(harness.db, adaSolo, ada, { completionMessageCount: 0 });
		await complete(ada, id);

		const [row] = await readTaskCompletionRows(harness.db, adaSolo);
		expect(defined(row, 'completion row').completionMessageIndex).toBeNull();
	});

	it("refuses someone else's solo space and task as not theirs at all", async () => {
		const junSolo = await testSoloSpace(harness.db, jun.id);
		const { id } = await createTestTask(harness.db, junSolo, jun);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);

		await expect(
			createTask(harness.db, ada, junSolo, crypto.randomUUID(), taskInput(vaultId))
		).resolves.toEqual({ ok: false, reason: 'not-a-member' });
		// not-found, not forbidden or conflict: nothing says the task exists.
		await expect(
			updateTask(harness.db, ada, id, { ...taskInput(vaultId), expectedRevision: 0 })
		).resolves.toEqual({ ok: false, reason: 'not-found' });
		await expect(completeTask(harness.db, ada, id)).resolves.toEqual({
			ok: false,
			reason: 'not-found'
		});
		await expect(getTaskForViewer(harness.db, ada, id)).resolves.toBeNull();
	});
});

describe('task writes', () => {
	it('refuses a create naming an id that is already taken, and changes nothing', async () => {
		const { id, ciphertext } = await createTestTask(harness.db, adaSolo, ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);

		await expect(createTask(harness.db, ada, adaSolo, id, taskInput(vaultId))).resolves.toEqual({
			ok: false,
			reason: 'id-taken'
		});
		await expect(readTaskRow(harness.db, id)).resolves.toMatchObject({ ciphertext });
	});

	it('bumps the revision on an update made at the current revision', async () => {
		const { id } = await createTestTask(harness.db, adaSolo, ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const ciphertext = fakeSealed('v1');

		await expect(
			updateTask(harness.db, ada, id, {
				...taskInput(vaultId, { ciphertext, completionMessageCount: 4 }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: true });
		await expect(readTaskRow(harness.db, id)).resolves.toMatchObject({
			revision: 1,
			ciphertext,
			completionMessageCount: 4
		});
	});

	it('refuses an update made at a stale revision, and keeps the newer content', async () => {
		const { id } = await createTestTask(harness.db, adaSolo, ada);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const newer = fakeSealed('newer');

		await updateTask(harness.db, ada, id, {
			...taskInput(vaultId, { ciphertext: newer }),
			expectedRevision: 0
		});
		await expect(
			updateTask(harness.db, ada, id, {
				...taskInput(vaultId, { ciphertext: fakeSealed('stale') }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'conflict' });
		await expect(readTaskRow(harness.db, id)).resolves.toMatchObject({
			revision: 1,
			ciphertext: newer
		});
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
				createTask(harness.db, ada, spaceId, crypto.randomUUID(), taskInput(vaultId))
			).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
		}

		const solo = await createTestTask(harness.db, adaSolo, ada);
		await expect(
			updateTask(harness.db, ada, solo.id, { ...taskInput(sharedVault), expectedRevision: 0 })
		).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
		await expect(readTaskRow(harness.db, solo.id)).resolves.toMatchObject({
			ciphertext: solo.ciphertext
		});

		const set = await createTestTask(harness.db, shared, ada);
		await expect(
			updateTaskContent(harness.db, ada, set.id, {
				content: taskInput(otherVault).content,
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'wrong-vault' });
		await expect(readTaskRow(harness.db, set.id)).resolves.toMatchObject({
			ciphertext: set.ciphertext
		});
	});

	it('refuses a write while the space has no vault at all', async () => {
		await expect(
			createTask(harness.db, ada, adaSolo, crypto.randomUUID(), taskInput(crypto.randomUUID()))
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
			createTask(harness.db, ada, adaSolo, id, taskInput(vaultId, overrides))
		).resolves.toEqual({ ok: false, reason: 'bad-content' });
		await expect(readTaskRow(harness.db, id)).resolves.toBeUndefined();
	});

	it('refuses a malformed ciphertext in a shared space too', async () => {
		const shared = await partnership('mix');
		const vaultId = await ensureTestPartnershipVault(harness.db, shared);

		await expect(
			createTask(
				harness.db,
				ada,
				shared,
				crypto.randomUUID(),
				taskInput(vaultId, { ciphertext: 'plain title' })
			)
		).resolves.toEqual({ ok: false, reason: 'bad-content' });
	});

	it('replaces only the content, so ticking a box does not reschedule the task', async () => {
		const { id } = await createTestTask(harness.db, adaSolo, ada, {
			schedule: { mode: 'after-completion', every: 1, unit: 'day' }
		});
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		await complete(ada, id);
		const before = defined(await readTaskRow(harness.db, id), 'task');
		const ciphertext = fakeSealed('ticked');

		await expect(
			updateTaskContent(harness.db, ada, id, {
				content: taskInput(vaultId, { ciphertext }).content,
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: true });
		await expect(readTaskRow(harness.db, id)).resolves.toMatchObject({
			ciphertext,
			revision: 1,
			nextEligibleAt: before.nextEligibleAt,
			active: before.active,
			creditsAwarded: before.creditsAwarded
		});
		await expect(
			updateTaskContent(harness.db, ada, id, {
				content: taskInput(vaultId).content,
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'conflict' });
	});
});

describe('a shared space', () => {
	it('creates a task for the other member, and lists it on each side', async () => {
		const shared = await partnership('me');
		const vaultId = await ensureTestPartnershipVault(harness.db, shared);
		const id = crypto.randomUUID();
		const ciphertext = fakeSealed('partner');

		await expect(
			createTask(
				harness.db,
				ada,
				shared,
				id,
				taskInput(vaultId, { ciphertext, creditsAwarded: 3, timezoneOwnerUserId: jun.id })
			)
		).resolves.toEqual({ ok: true, id });
		await expect(readTaskRow(harness.db, id)).resolves.toMatchObject({
			spaceId: shared,
			createdByUserId: ada.id,
			// The authorship rule: never the creator, so the other member.
			assigneeUserId: jun.id,
			timezoneOwnerUserId: jun.id,
			ciphertext,
			vaultId,
			revision: 0
		});

		const adas = await listTasks(harness.db, ada, [shared]);
		expect(adas.toDo).toEqual([]);
		expect(adas.setForOthers).toEqual([
			expect.objectContaining({ id, createdByMe: true, canManage: true, canComplete: false })
		]);
		expect(adas.spaces).toEqual([
			{
				id: shared,
				kind: 'shared',
				canManage: true,
				viewerActs: false,
				others: [{ userId: jun.id, timezone: jun.timezone }]
			}
		]);
		// Ada does not act here, so has no balance of her own; she sets Jun's.
		expect(adas.balances).toEqual([
			{ spaceId: shared, userId: jun.id, mine: false, credits: 0, canSet: true }
		]);

		const juns = await listTasks(harness.db, jun, [shared]);
		expect(juns.setForOthers).toEqual([]);
		expect(juns.toDo).toEqual([
			expect.objectContaining({ id, createdByMe: false, canManage: false, canComplete: true })
		]);
		expect(juns.balances).toEqual([
			{ spaceId: shared, userId: jun.id, mine: true, credits: 0, canSet: false }
		]);
	});

	it('refuses a time zone owner who is not in the space', async () => {
		const shared = await partnership('me');
		const vaultId = await ensureTestPartnershipVault(harness.db, shared);
		const stranger = await createTestUser(harness.db, { name: 'Stranger' });

		await expect(
			createTask(
				harness.db,
				ada,
				shared,
				crypto.randomUUID(),
				taskInput(vaultId, { timezoneOwnerUserId: stranger.id })
			)
		).resolves.toEqual({ ok: false, reason: 'bad-timezone-owner' });

		const { id } = await createTestTask(harness.db, shared, ada);
		await expect(
			updateTask(harness.db, ada, id, {
				...taskInput(vaultId, { timezoneOwnerUserId: stranger.id }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'bad-timezone-owner' });
	});

	it('refuses a create from the member who does not manage, under one-sided control', async () => {
		const shared = await partnership('me');
		const vaultId = await ensureTestPartnershipVault(harness.db, shared);

		await expect(
			createTask(harness.db, jun, shared, crypto.randomUUID(), taskInput(vaultId))
		).resolves.toEqual({ ok: false, reason: 'forbidden' });
	});

	it('refuses a non-member, and a pending invite that has no space to write in yet', async () => {
		const shared = await partnership('mix');
		const vaultId = await ensureTestPartnershipVault(harness.db, shared);
		const { id } = await createTestTask(harness.db, shared, ada);
		const stranger = await createTestUser(harness.db, { name: 'Stranger' });

		await expect(
			createTask(harness.db, stranger, shared, crypto.randomUUID(), taskInput(vaultId))
		).resolves.toEqual({ ok: false, reason: 'not-a-member' });
		await expect(
			updateTask(harness.db, stranger, id, { ...taskInput(vaultId), expectedRevision: 0 })
		).resolves.toEqual({ ok: false, reason: 'not-found' });
		await expect(completeTask(harness.db, stranger, id)).resolves.toEqual({
			ok: false,
			reason: 'not-found'
		});
		await expect(getTaskForViewer(harness.db, stranger, id)).resolves.toBeNull();

		// Ada is the pending invite's only member, but it is not a space until accepted.
		const invite = await createTestInvite(harness.db, ada);
		await expect(
			createTask(harness.db, ada, invite.id, crypto.randomUUID(), taskInput(vaultId))
		).resolves.toEqual({ ok: false, reason: 'not-a-member' });
		await expect(listTasks(harness.db, ada, [invite.id])).resolves.toEqual({
			spaces: [],
			toDo: [],
			setForOthers: [],
			balances: []
		});
	});

	it('lets only the setter edit, never the member it is set for', async () => {
		const shared = await partnership('mix');
		const vaultId = await ensureTestPartnershipVault(harness.db, shared);
		const { id } = await createTestTask(harness.db, shared, ada);
		const newer = fakeSealed('newer');

		await expect(
			updateTask(harness.db, ada, id, {
				...taskInput(vaultId, { ciphertext: newer }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: true });
		await expect(
			updateTask(harness.db, ada, id, {
				...taskInput(vaultId, { ciphertext: fakeSealed('stale') }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: false, reason: 'conflict' });
		// Jun manages the space too, but the task is set for him: editing it
		// would let him set his own credits for it.
		await expect(
			updateTask(harness.db, jun, id, { ...taskInput(vaultId), expectedRevision: 1 })
		).resolves.toEqual({ ok: false, reason: 'forbidden' });
		await expect(
			updateTaskContent(harness.db, jun, id, {
				content: taskInput(vaultId).content,
				expectedRevision: 1
			})
		).resolves.toEqual({ ok: false, reason: 'forbidden' });

		await expect(readTaskRow(harness.db, id)).resolves.toMatchObject({
			revision: 1,
			ciphertext: newer
		});
		const list = await listTasks(harness.db, ada, [shared]);
		expect(list.setForOthers).toContainEqual(
			expect.objectContaining({
				id,
				revision: 1,
				sealed: { recordId: id, vaultId, ciphertext: newer, payloadVersion: 1 }
			})
		);
	});

	it("notes the partner's time zone on a scheduled task they set", async () => {
		// The clock is frozen because the anchor below is a fixed date and the
		// `canComplete: false` assertion means "not due yet". Left on the real
		// clock this passed until 2026-09-20 and failed every day after — the
		// task simply came due. Any test asserting a schedule's state has to
		// pin the date it is asserting that state relative to.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-18T12:00:00Z'));

		const shared = await partnership('them');
		const { id, ciphertext } = await createTestTask(harness.db, shared, jun, {
			schedule: {
				mode: 'scheduled',
				anchorLocal: '2026-09-20T10:00',
				frequency: 'week',
				interval: 1,
				weekdays: ['su'],
				end: { kind: 'never' }
			},
			timezoneOwnerUserId: jun.id
		});

		const list = await listTasks(harness.db, ada, [shared]);
		expect(list.spaces).toEqual([expect.objectContaining({ canManage: false, viewerActs: true })]);
		expect(list.toDo).toEqual([
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
		]);
	});

	it('omits the time zone note for a one-off task with no date of its own', async () => {
		const shared = await partnership('them');
		const { id } = await createTestTask(harness.db, shared, jun, {
			timezoneOwnerUserId: jun.id
		});

		const list = await listTasks(harness.db, ada, [shared]);
		expect(list.toDo).toEqual([expect.objectContaining({ id, timeZoneNote: null })]);
	});

	it("credits the completer's balance in the space and deactivates a one-off", async () => {
		const shared = await partnership('them');
		const { id } = await createTestTask(harness.db, shared, jun, { creditsAwarded: 5 });

		await expect(completeTask(harness.db, ada, id)).resolves.toEqual({
			ok: true,
			completionId: expect.any(String)
		});
		await expect(readBalanceRow(harness.db, shared, ada.id)).resolves.toMatchObject({
			credits: 5
		});
		// The setter earns nothing, and Ada's solo balance is untouched: never pooled.
		await expect(readBalanceRow(harness.db, shared, jun.id)).resolves.toBeUndefined();
		await expect(readBalanceRow(harness.db, adaSolo, ada.id)).resolves.toBeUndefined();
		await expect(readTaskRow(harness.db, id)).resolves.toMatchObject({
			active: false,
			completedCount: 1
		});
	});

	it("snapshots the author's sealed task when the other member completes it", async () => {
		const shared = await partnership('them');
		const vaultId = await ensureTestPartnershipVault(harness.db, shared);
		const { id, ciphertext } = await createTestTask(harness.db, shared, jun, {
			completionMessageCount: 2
		});
		await complete(ada, id);

		const [row] = await readTaskCompletionRows(harness.db, shared);
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

		await expect(listTaskCompletions(harness.db, ada.id, [shared])).resolves.toEqual([
			expect.objectContaining({
				mine: true,
				createdByMe: false,
				sealed: { recordId: id, vaultId, ciphertext, payloadVersion: 1 },
				completionMessageIndex: index
			})
		]);
		await expect(listTaskCompletions(harness.db, jun.id, [shared])).resolves.toEqual([
			expect.objectContaining({ mine: false, createdByMe: true })
		]);
	});

	it('records no message index for a shared task with no completion messages', async () => {
		const shared = await partnership('them');
		const { id } = await createTestTask(harness.db, shared, jun, { completionMessageCount: 0 });
		await complete(ada, id);

		const [row] = await readTaskCompletionRows(harness.db, shared);
		expect(defined(row, 'completion row').completionMessageIndex).toBeNull();
	});

	it('refuses the manager completing a task they set, under one-sided control', async () => {
		const shared = await partnership('me');
		const { id } = await createTestTask(harness.db, shared, ada);

		await expect(completeTask(harness.db, ada, id)).resolves.toEqual({
			ok: false,
			reason: 'not-allowed'
		});
		await complete(jun, id);
	});

	it('splits To do from Set for others by author under shared control', async () => {
		const shared = await partnership('mix');
		const fromAda = await createTestTask(harness.db, shared, ada);
		const fromJun = await createTestTask(harness.db, shared, jun);

		// Both manage, so both act — but never on what they wrote themselves.
		const adas = await listTasks(harness.db, ada, [shared]);
		expect(ids(adas.toDo)).toEqual([fromJun.id]);
		expect(ids(adas.setForOthers)).toEqual([fromAda.id]);
		expect(adas.balances).toEqual([
			{ spaceId: shared, userId: ada.id, mine: true, credits: 0, canSet: false },
			{ spaceId: shared, userId: jun.id, mine: false, credits: 0, canSet: true }
		]);

		const juns = await listTasks(harness.db, jun, [shared]);
		expect(ids(juns.toDo)).toEqual([fromAda.id]);
		expect(ids(juns.setForOthers)).toEqual([fromJun.id]);
	});

	it('refuses the author completing their own task under shared control', async () => {
		const shared = await partnership('mix');
		const { id } = await createTestTask(harness.db, shared, ada);

		await expect(completeTask(harness.db, ada, id)).resolves.toEqual({
			ok: false,
			reason: 'not-allowed'
		});
		await expect(readTaskCompletionRows(harness.db, shared)).resolves.toEqual([]);
	});

	it('hides, rather than deletes, tasks left on the wrong side when control changes', async () => {
		const shared = await partnership('mix');
		const fromJun = await createTestTask(harness.db, shared, jun);
		const fromAda = await createTestTask(harness.db, shared, ada);

		// Ada alone now: Jun can set nothing, so what Jun set for Ada is on
		// nobody's list — but it is still there if control comes back.
		await setTestPartnershipControl(harness.db, shared, 'inviter');

		const adas = await listTasks(harness.db, ada, [shared]);
		expect(adas.toDo).toEqual([]);
		expect(ids(adas.setForOthers)).toEqual([fromAda.id]);
		const juns = await listTasks(harness.db, jun, [shared]);
		expect(ids(juns.toDo)).toEqual([fromAda.id]);
		expect(juns.setForOthers).toEqual([]);
		await expect(completeTask(harness.db, ada, fromJun.id)).resolves.toEqual({
			ok: false,
			reason: 'not-allowed'
		});
		await expect(readTaskRow(harness.db, fromJun.id)).resolves.toBeTruthy();

		await setTestPartnershipControl(harness.db, shared, 'both');
		expect(ids((await listTasks(harness.db, ada, [shared])).toDo)).toEqual([fromJun.id]);
	});

	it('hides a task from both sides when control flips to the member it was set for', async () => {
		const shared = await partnership('me');
		const { id } = await createTestTask(harness.db, shared, ada);

		await setTestPartnershipControl(harness.db, shared, 'invitee');

		for (const viewer of [ada, jun]) {
			const list = await listTasks(harness.db, viewer, [shared]);
			expect(list.toDo).toEqual([]);
			expect(list.setForOthers).toEqual([]);
		}
		// Jun manages now, but the task is still set for him, so it is not his to edit.
		const vaultId = await ensureTestPartnershipVault(harness.db, shared);
		await expect(
			updateTask(harness.db, jun, id, { ...taskInput(vaultId), expectedRevision: 0 })
		).resolves.toEqual({ ok: false, reason: 'forbidden' });
		await expect(readTaskRow(harness.db, id)).resolves.toBeTruthy();
	});
});

describe('several spaces at once (Everyone)', () => {
	it('lists every space in the order given, with each list and balance kept apart', async () => {
		const cas = await createTestUser(harness.db, { name: 'Cas', timezone: 'Australia/Sydney' });
		const pat = await createTestUser(harness.db, { name: 'Pat', timezone: 'UTC' });
		const withJun = await partnership('them'); // Jun sets for Ada
		const withCas = await partnership('me', cas); // Ada sets for Cas
		const withPat = await partnership('mix', pat); // both ways
		// A space Ada is not in, named anyway: left out, not an error.
		const notAdas = (await createTestPartnership(harness.db, jun, cas)).id;

		const own = await createTestTask(harness.db, adaSolo, ada);
		const fromJun = await createTestTask(harness.db, withJun, jun);
		const forCas = await createTestTask(harness.db, withCas, ada);
		const fromPat = await createTestTask(harness.db, withPat, pat);
		const forPat = await createTestTask(harness.db, withPat, ada);
		await createTestTask(harness.db, notAdas, jun);

		const list = await listTasks(harness.db, ada, [adaSolo, withJun, withCas, notAdas, withPat]);

		expect(list.spaces.map((space) => space.id)).toEqual([adaSolo, withJun, withCas, withPat]);
		expect(ids(list.toDo)).toEqual(ids([own, fromJun, fromPat]));
		expect(ids(list.setForOthers)).toEqual(ids([forCas, forPat]));
		expect(list.balances).toEqual([
			{ spaceId: adaSolo, userId: ada.id, mine: true, credits: 0, canSet: true },
			{ spaceId: withJun, userId: ada.id, mine: true, credits: 0, canSet: false },
			{ spaceId: withCas, userId: cas.id, mine: false, credits: 0, canSet: true },
			{ spaceId: withPat, userId: ada.id, mine: true, credits: 0, canSet: false },
			{ spaceId: withPat, userId: pat.id, mine: false, credits: 0, canSet: true }
		]);
	});

	it('lists completions from every space named, and none from one the viewer is not in', async () => {
		const withJun = await partnership('them');
		const cas = await createTestUser(harness.db, { name: 'Cas' });
		const notAdas = (await createTestPartnership(harness.db, jun, cas, { control: 'me' })).id;
		const own = await createTestTask(harness.db, adaSolo, ada);
		const fromJun = await createTestTask(harness.db, withJun, jun);
		const forCas = await createTestTask(harness.db, notAdas, jun);
		await complete(ada, own.id);
		await complete(ada, fromJun.id);
		await complete(cas, forCas.id);

		const history = await listTaskCompletions(harness.db, ada.id, [adaSolo, withJun, notAdas]);
		expect(history.map((row) => row.spaceId).sort(byText)).toEqual([adaSolo, withJun].sort(byText));
		await expect(listTaskCompletions(harness.db, ada.id, [notAdas])).resolves.toEqual([]);
	});
});

describe('rolling window counts', () => {
	const threeAWeek = {
		mode: 'rolling-window',
		limit: { completions: 3, every: 1, unit: 'week' }
	} as const;

	it("counts the completions still inside a solo task's window", async () => {
		const { id } = await createTestTask(harness.db, adaSolo, ada, { schedule: threeAWeek });
		const plain = await createTestTask(harness.db, adaSolo, ada);
		await complete(ada, id, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));
		await complete(ada, id);
		await complete(ada, id);

		const list = await listTasks(harness.db, ada, [adaSolo]);
		const byId = new Map(list.toDo.map((task) => [task.id, task]));
		expect(byId.get(id)?.windowCompletions).toBe(2);
		expect(byId.get(plain.id)?.windowCompletions).toBeNull();
	});

	it('counts them for a shared task, on both sides and across several spaces', async () => {
		const shared = await partnership('them');
		const { id } = await createTestTask(harness.db, shared, jun, { schedule: threeAWeek });
		await complete(ada, id);

		const adas = await listTasks(harness.db, ada, [shared]);
		expect(adas.toDo.find((task) => task.id === id)?.windowCompletions).toBe(1);
		const juns = await listTasks(harness.db, jun, [shared]);
		expect(juns.setForOthers.find((task) => task.id === id)?.windowCompletions).toBe(1);
		const everyone = await listTasks(harness.db, ada, [adaSolo, shared]);
		expect(everyone.toDo.find((task) => task.id === id)?.windowCompletions).toBe(1);
	});
});

describe('completing adds credits in SQL', () => {
	it('adds to a balance that is already there rather than replacing it', async () => {
		await setTestBalance(harness.db, adaSolo, ada, ada, 10);
		const { id } = await createTestTask(harness.db, adaSolo, ada, { creditsAwarded: 3 });
		await complete(ada, id);
		await expect(readBalanceRow(harness.db, adaSolo, ada.id)).resolves.toMatchObject({
			credits: 13
		});
	});

	it('adds to the balance in the task’s own space only', async () => {
		const shared = await partnership('them');
		await setTestBalance(harness.db, adaSolo, ada, ada, 10);
		await setTestBalance(harness.db, shared, jun, ada, 1);
		const { id } = await createTestTask(harness.db, shared, jun, { creditsAwarded: 3 });
		await complete(ada, id);

		await expect(readBalanceRow(harness.db, shared, ada.id)).resolves.toMatchObject({
			credits: 4
		});
		await expect(readBalanceRow(harness.db, adaSolo, ada.id)).resolves.toMatchObject({
			credits: 10
		});
	});
});

describe('undoing a completion in a solo space', () => {
	it('records the task as it was on the completion', async () => {
		const { id } = await createTestTask(harness.db, adaSolo, ada);
		await complete(ada, id);
		const [row] = await readTaskCompletionRows(harness.db, adaSolo);
		expect(row).toMatchObject({
			previousActive: true,
			previousNextEligibleAt: null,
			previousLastCompletedAt: null
		});
	});

	it('puts a one-off back as it was, and takes the credits back', async () => {
		const { id } = await createTestTask(harness.db, adaSolo, ada, { creditsAwarded: 4 });
		const completionId = await complete(ada, id);

		await expect(undoTaskCompletion(harness.db, ada, completionId)).resolves.toEqual({ ok: true });
		await expect(readTaskRow(harness.db, id)).resolves.toMatchObject({
			active: true,
			completedCount: 0,
			lastCompletedAt: null,
			nextEligibleAt: null
		});
		await expect(readBalanceRow(harness.db, adaSolo, ada.id)).resolves.toMatchObject({
			credits: 0
		});
		await expect(readTaskCompletionRows(harness.db, adaSolo)).resolves.toEqual([]);
	});

	it("restores a scheduled task's next occurrence even after its schedule was edited", async () => {
		const schedule = {
			mode: 'scheduled',
			anchorLocal: '2026-01-05T09:00',
			frequency: 'day',
			interval: 1,
			end: { kind: 'never' }
		} as const;
		const { id } = await createTestTask(harness.db, adaSolo, ada, { schedule });
		const before = defined(await readTaskRow(harness.db, id), 'task').nextEligibleAt;
		const completionId = await complete(ada, id);
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		await expect(
			updateTask(harness.db, ada, id, {
				...taskInput(vaultId, { schedule: { ...schedule, frequency: 'week' } }),
				expectedRevision: 0
			})
		).resolves.toEqual({ ok: true });

		await expect(undoTaskCompletion(harness.db, ada, completionId)).resolves.toEqual({ ok: true });
		expect(defined(await readTaskRow(harness.db, id), 'task').nextEligibleAt).toEqual(before);
	});

	it('refuses anyone outside the space, and a completion that does not exist', async () => {
		const { id } = await createTestTask(harness.db, adaSolo, ada);
		const completionId = await complete(ada, id);
		// Jun is not in Ada's solo space, so to him the completion is not there at all.
		await expect(undoTaskCompletion(harness.db, jun, completionId)).resolves.toEqual({
			ok: false,
			reason: 'not-found'
		});
		await expect(undoTaskCompletion(harness.db, ada, crypto.randomUUID())).resolves.toEqual({
			ok: false,
			reason: 'not-found'
		});
	});

	it('refuses all but the newest completion of the task', async () => {
		const { id } = await createTestTask(harness.db, adaSolo, ada, {
			schedule: { mode: 'rolling-window', limit: null }
		});
		const first = await complete(ada, id, new Date(Date.now() - 1000));
		const second = await complete(ada, id);
		await expect(undoTaskCompletion(harness.db, ada, first)).resolves.toEqual({
			ok: false,
			reason: 'not-latest'
		});
		await expect(undoTaskCompletion(harness.db, ada, second)).resolves.toEqual({ ok: true });
	});

	it('refuses once the undo window has passed', async () => {
		const { id } = await createTestTask(harness.db, adaSolo, ada);
		const completedAt = new Date();
		const completionId = await complete(ada, id, completedAt);
		const later = new Date(completedAt.getTime() + UNDO_WINDOW_MS + 1);
		await expect(undoTaskCompletion(harness.db, ada, completionId, later)).resolves.toEqual({
			ok: false,
			reason: 'too-old'
		});
	});

	it('refuses a completion recorded before undo existed', async () => {
		const { id } = await createTestTask(harness.db, adaSolo, ada);
		const completionId = await complete(ada, id);
		await harness.db
			.update(taskCompletions)
			.set({ previousActive: null })
			.where(eq(taskCompletions.id, completionId));
		await expect(undoTaskCompletion(harness.db, ada, completionId)).resolves.toEqual({
			ok: false,
			reason: 'not-undoable'
		});
	});

	it('refuses when the credits it gave have been spent, and changes nothing', async () => {
		const { id } = await createTestTask(harness.db, adaSolo, ada, { creditsAwarded: 4 });
		const completionId = await complete(ada, id);
		await setTestBalance(harness.db, adaSolo, ada, ada, 1);

		await expect(undoTaskCompletion(harness.db, ada, completionId)).resolves.toEqual({
			ok: false,
			reason: 'credits-spent'
		});
		await expect(readTaskRow(harness.db, id)).resolves.toMatchObject({ active: false });
		await expect(readTaskCompletionRows(harness.db, adaSolo)).resolves.toHaveLength(1);
		await expect(readBalanceRow(harness.db, adaSolo, ada.id)).resolves.toMatchObject({
			credits: 1
		});
	});
});

describe('undoing a completion in a shared space', () => {
	async function completed(control: 'them' | 'mix' = 'them') {
		const shared = await partnership(control);
		const { id } = await createTestTask(harness.db, shared, jun, { creditsAwarded: 5 });
		const completionId = await complete(ada, id);
		return { shared, taskId: id, completionId };
	}

	it("puts the task back and takes the completer's credits back", async () => {
		const { shared, taskId, completionId } = await completed();
		await expect(undoTaskCompletion(harness.db, ada, completionId)).resolves.toEqual({ ok: true });
		await expect(readTaskRow(harness.db, taskId)).resolves.toMatchObject({
			active: true,
			completedCount: 0
		});
		await expect(readBalanceRow(harness.db, shared, ada.id)).resolves.toMatchObject({
			credits: 0
		});
		await expect(readTaskCompletionRows(harness.db, shared)).resolves.toEqual([]);
	});

	it('refuses the member who set it, even when both manage', async () => {
		const { completionId } = await completed('mix');
		await expect(undoTaskCompletion(harness.db, jun, completionId)).resolves.toEqual({
			ok: false,
			reason: 'not-yours'
		});
	});

	it('refuses the completer once the task is no longer theirs to do', async () => {
		const { shared, completionId } = await completed('mix');
		// Ada alone manages now, so what Jun set for her is hidden from her.
		await setTestPartnershipControl(harness.db, shared, 'inviter');
		await expect(undoTaskCompletion(harness.db, ada, completionId)).resolves.toEqual({
			ok: false,
			reason: 'not-yours'
		});
	});

	it('refuses someone outside the space as if the completion were not there', async () => {
		const { completionId } = await completed();
		const eve = await createTestUser(harness.db, { name: 'Eve' });
		await expect(undoTaskCompletion(harness.db, eve, completionId)).resolves.toEqual({
			ok: false,
			reason: 'not-found'
		});
	});
});

describe('the tasks widget', () => {
	it('splits ready from waiting, and never counts an inactive task', async () => {
		const ready = await createTestTask(harness.db, adaSolo, ada, { creditsAwarded: 2 });
		await createTestTask(harness.db, adaSolo, ada, { active: false });

		const widget = await getTasksWidget(harness.db, ada.id, [adaSolo], new Map());
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
		const { id, ciphertext } = await createTestTask(harness.db, adaSolo, ada);

		const widget = await getTasksWidget(harness.db, ada.id, [adaSolo], new Map());
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
		const { id } = await createTestTask(harness.db, adaSolo, ada);
		// A whole day in the future, so `now` below is unambiguously before it
		// whatever timezone the fixture resolved the schedule against.
		const later = new Date(Date.now() + 24 * 60 * 60 * 1000);
		await harness.db.update(tasks).set({ nextEligibleAt: later }).where(eq(tasks.id, id));

		const widget = await getTasksWidget(harness.db, ada.id, [adaSolo], new Map());
		expect(widget).toMatchObject({ readyCount: 0, waitingCount: 1, activeCount: 1, ready: [] });
	});

	it('omits your own task from your ready list even under shared control', async () => {
		const shared = await partnership('mix');
		const adas = await createTestTask(harness.db, shared, ada);
		const juns = await createTestTask(harness.db, shared, jun);

		// Shared control means both sides complete — but never their own, which
		// is the rule this widget is easiest to get wrong on.
		await expect(getTasksWidget(harness.db, ada.id, [shared], new Map())).resolves.toMatchObject({
			viewerActs: true,
			ready: [{ id: juns.id, sealed: expect.objectContaining({ ciphertext: juns.ciphertext }) }],
			readyCount: 1
		});
		await expect(getTasksWidget(harness.db, jun.id, [shared], new Map())).resolves.toMatchObject({
			ready: [{ id: adas.id, sealed: expect.objectContaining({ ciphertext: adas.ciphertext }) }],
			readyCount: 1
		});
	});

	it('shows the managing side a count of what it set, and no ready list', async () => {
		const shared = await partnership('me');
		await createTestTask(harness.db, shared, ada);
		await createTestTask(harness.db, shared, ada);

		await expect(getTasksWidget(harness.db, ada.id, [shared], new Map())).resolves.toEqual({
			viewerActs: false,
			ready: [],
			readyCount: 0,
			waitingCount: 0,
			activeCount: 2
		});
	});

	it('is the empty view for someone who is not in the space', async () => {
		const stranger = await createTestUser(harness.db);
		const shared = await partnership('mix');
		await createTestTask(harness.db, shared, ada);

		await expect(getTasksWidget(harness.db, stranger.id, [shared], new Map())).resolves.toEqual({
			viewerActs: true,
			ready: [],
			readyCount: 0,
			waitingCount: 0,
			activeCount: 0
		});
	});

	/**
	 * Today in Everyone is not a solo-only view, and this is the bug that proves it: the
	 * card said "nothing to do" while a partner task sat waiting one tap away,
	 * because it only ever read the solo space. It has to match the tasks page,
	 * which lists every space the context shows.
	 */
	it('merges tasks set for you in a shared space with your own, naming whose is whose', async () => {
		const shared = await partnership('them');
		const own = await createTestTask(harness.db, adaSolo, ada);
		const assigned = await createTestTask(harness.db, shared, jun);
		const names = new Map([[shared, testPartnerView(shared, 'Jun').names]]);

		const widget = await getTasksWidget(harness.db, ada.id, [adaSolo, shared], names);
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
					context: names.get(shared)
				})
			])
		);
	});

	it('leaves out what you set in a space you manage, alongside spaces you act in', async () => {
		const shared = await partnership('me');
		const { id } = await createTestTask(harness.db, shared, ada);
		const names = new Map([[shared, testPartnerView(shared, 'Jun').names]]);

		// Ada acts in her solo space, so the card is a to-do list, and what she
		// set for Jun is not on it.
		await expect(
			getTasksWidget(harness.db, ada.id, [adaSolo, shared], names)
		).resolves.toMatchObject({ viewerActs: true, activeCount: 0, ready: [] });

		// And it does show up for the side that has to do it.
		const junSolo = await testSoloSpace(harness.db, jun.id);
		const junsNames = new Map([[shared, testPartnerView(shared, 'Ada').names]]);
		const junsWidget = await getTasksWidget(harness.db, jun.id, [junSolo, shared], junsNames);
		expect(junsWidget.ready).toEqual([
			expect.objectContaining({ id, context: junsNames.get(shared) })
		]);
	});

	it('names no space when it covers only one', async () => {
		const shared = await partnership('them');
		await createTestTask(harness.db, shared, jun);
		const names = new Map([[shared, testPartnerView(shared, 'Jun').names]]);

		const widget = await getTasksWidget(harness.db, ada.id, [shared], names);
		expect(widget.ready).toEqual([expect.objectContaining({ context: null })]);
	});

	it('shows at most three rows, and counts the rest', async () => {
		for (let made = 0; made < 5; made += 1) {
			await createTestTask(harness.db, adaSolo, ada);
		}
		const widget = await getTasksWidget(harness.db, ada.id, [adaSolo], new Map());
		expect(widget.ready).toHaveLength(3);
		expect(widget).toMatchObject({ readyCount: 5, activeCount: 5 });
	});
});

describe('balances are written in SQL', () => {
	it('keeps one row per space and member, whatever completes into it', async () => {
		const shared = await partnership('mix');
		const fromJun = await createTestTask(harness.db, shared, jun, {
			creditsAwarded: 2,
			schedule: { mode: 'rolling-window', limit: null }
		});
		await complete(ada, fromJun.id);
		await complete(ada, fromJun.id);

		const rows = await harness.db
			.select()
			.from(rewardBalances)
			.where(eq(rewardBalances.spaceId, shared));
		expect(rows).toEqual([expect.objectContaining({ userId: ada.id, credits: 4 })]);
	});
});
