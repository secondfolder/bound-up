import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestPartnershipTask,
	createTestSelfTask,
	createTestUser,
	ensureTestPartnershipVault,
	fakeSealed,
	readTaskRow,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

/**
 * Editing a task: its space is its own, so it opens from any context, and
 * only for whoever may edit it — their own, or one they set for someone else.
 */

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;
let kit: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
	kit = await createTestUser(db, { name: 'Kit' });
});

afterEach(() => harness.close());

const at = (user: TestUser, taskId: string, formData?: Record<string, string>) =>
	fakeEvent({ db, user, params: { taskId }, path: `/tasks/${taskId}`, formData });

function sealedPost(recordId: string, vaultId: string, overrides: Record<string, string> = {}) {
	return {
		creditsAwarded: '5',
		scheduleMode: 'one-off',
		rollingLimitCompletions: '1',
		rollingLimitEvery: '1',
		rollingLimitUnit: 'day',
		afterEvery: '1',
		afterUnit: 'day',
		scheduledAnchorLocal: '',
		scheduledFrequency: 'week',
		scheduledInterval: '1',
		scheduledMonthlyPatternKind: 'day-of-month',
		scheduledDayOfMonth: '1',
		scheduledOrdinal: '1',
		scheduledWeekday: 'mo',
		scheduledEndKind: 'never',
		scheduledUntilLocal: '',
		scheduledCount: '1',
		active: 'on',
		timezoneOwnerUserId: jun.id,
		recordId,
		vaultId,
		ciphertext: fakeSealed('edited'),
		payloadVersion: '1',
		completionMessageCount: '0',
		expectedRevision: '0',
		...overrides
	};
}

describe('load', () => {
	it('opens a task you set for your partner, with its space', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada);
		const data = await runLoad(load(at(ada, task.id)));
		expect(data.task).toMatchObject({ id: task.id, canManage: true, spaceId: id });
		expect(data.space).toMatchObject({ id, kind: 'shared', others: [{ userId: jun.id }] });
	});

	it('opens your own task', async () => {
		const task = await createTestSelfTask(db, ada);
		await expect(runLoad(load(at(ada, task.id)))).resolves.toMatchObject({
			task: { id: task.id, canManage: true },
			space: { kind: 'solo' }
		});
	});

	it('403s whoever the task is set for', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada);
		await expect(runAndCatch(() => runLoad(load(at(jun, task.id))))).resolves.toMatchObject({
			type: 'error',
			status: 403
		});
	});

	it('404s a task in a space you are not in', async () => {
		const task = await createTestSelfTask(db, kit);
		await expect(runAndCatch(() => runLoad(load(at(ada, task.id))))).resolves.toMatchObject({
			type: 'error',
			status: 404
		});
	});
});

describe('the action', () => {
	it('saves for whoever set it, and refuses whoever it is for', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada);
		const form = sealedPost(task.id, await ensureTestPartnershipVault(db, id));

		await expect(actions.default?.(at(jun, task.id, form))).resolves.toMatchObject({
			status: 403
		});

		await expect(actions.default?.(at(ada, task.id, form))).resolves.toEqual({ saved: true });
		await expect(readTaskRow(db, task.id)).resolves.toMatchObject({
			creditsAwarded: 5,
			ciphertext: form.ciphertext,
			revision: 1
		});
	});

	it('refuses a stale revision rather than overwriting a newer edit', async () => {
		const task = await createTestSelfTask(db, ada);
		const { vaultId } = (await readTaskRow(db, task.id)) ?? { vaultId: '' };
		const first = sealedPost(task.id, vaultId, { timezoneOwnerUserId: ada.id });
		await actions.default?.(at(ada, task.id, first));
		const stale = await actions.default?.(
			at(ada, task.id, { ...first, ciphertext: fakeSealed('old') })
		);
		expect(stale).toMatchObject({ status: 409 });
	});
});
