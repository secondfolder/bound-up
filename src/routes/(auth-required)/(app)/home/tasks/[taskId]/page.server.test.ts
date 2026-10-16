import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestSelfTask,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readSelfTaskRow,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada', timezone: 'Europe/London' });
});

afterEach(() => harness.close());

const at = (taskId: string, user: TestUser | null, formData?: Record<string, string>) =>
	fakeEvent({ db, user, params: { taskId }, formData, path: `/home/tasks/${taskId}` });

/** The settings half of the editor's post, for a one-off task. */
const oneOffSettings = {
	creditsAwarded: '3',
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
	active: 'on'
};

/** An edit as the browser posts it: the settings, the content sealed, the revision it opened. */
async function sealedPost(taskId: string, overrides: Record<string, string> = {}) {
	return {
		...oneOffSettings,
		timezoneOwnerUserId: ada.id,
		recordId: taskId,
		vaultId: await ensureTestSelfVault(db, ada.id),
		ciphertext: fakeSealed('edited'),
		payloadVersion: '1',
		completionMessageCount: '1',
		expectedRevision: '0',
		...overrides
	};
}

describe('load', () => {
	it('loads the task with its sealed ref, and the settings into the form', async () => {
		const task = await createTestSelfTask(db, ada, { creditsAwarded: 4 });

		await expect(runLoad(load(at(task.id, ada)))).resolves.toMatchObject({
			task: {
				id: task.id,
				revision: 0,
				sealed: { recordId: task.id, ciphertext: task.ciphertext }
			},
			taskForm: { data: expect.objectContaining({ title: '', creditsAwarded: '4' }) }
		});
	});

	it("404s for another user's task", async () => {
		const jun = await createTestUser(db, { name: 'Jun' });
		const theirs = await createTestSelfTask(db, jun);
		const result = await runAndCatch(() => runLoad(load(at(theirs.id, ada))));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});

describe('actions', () => {
	it('updates the task and bumps its revision', async () => {
		const task = await createTestSelfTask(db, ada, { creditsAwarded: 2 });
		const post = await sealedPost(task.id, { completionMessageCount: '3' });

		const result = await actions.default?.(at(task.id, ada, post));
		expect(result).toEqual({ saved: true });
		await expect(readSelfTaskRow(db, task.id)).resolves.toMatchObject({
			ciphertext: post.ciphertext,
			completionMessageCount: 3,
			revision: 1,
			creditsAwarded: 3
		});
	});

	it('refuses an edit against a stale revision with a 409', async () => {
		const task = await createTestSelfTask(db, ada, { creditsAwarded: 2 });
		const first = await sealedPost(task.id);
		await actions.default?.(at(task.id, ada, first));

		const stale = await sealedPost(task.id, { creditsAwarded: '9' });
		const result = await runAndCatch(() => actions.default?.(at(task.id, ada, stale)));
		expect(result).toMatchObject({
			type: 'ok',
			value: { status: 409, data: { error: expect.any(String) } }
		});
		await expect(readSelfTaskRow(db, task.id)).resolves.toMatchObject({
			ciphertext: first.ciphertext,
			creditsAwarded: 3,
			revision: 1
		});
	});

	it('refuses a post whose recordId is not the task in the URL', async () => {
		const task = await createTestSelfTask(db, ada);
		const other = await createTestSelfTask(db, ada);
		const post = await sealedPost(other.id);

		const result = await runAndCatch(() => actions.default?.(at(task.id, ada, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 400 } });
		await expect(readSelfTaskRow(db, task.id)).resolves.toMatchObject({
			ciphertext: task.ciphertext,
			revision: 0
		});
		await expect(readSelfTaskRow(db, other.id)).resolves.toMatchObject({
			ciphertext: other.ciphertext,
			revision: 0
		});
	});

	it("refuses content sealed in a partnership's vault", async () => {
		const jun = await createTestUser(db, { name: 'Jun' });
		const { id } = await createTestPartnership(db, ada, jun);
		const task = await createTestSelfTask(db, ada);
		const post = await sealedPost(task.id, { vaultId: await ensureTestPartnershipVault(db, id) });

		const result = await runAndCatch(() => actions.default?.(at(task.id, ada, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 409 } });
		await expect(readSelfTaskRow(db, task.id)).resolves.toMatchObject({
			ciphertext: task.ciphertext,
			revision: 0
		});
	});

	it('does not store a title the post still carries', async () => {
		const task = await createTestSelfTask(db, ada);
		const post = await sealedPost(task.id, {
			title: 'Nap',
			description: 'Twenty minutes',
			completionMessagesText: 'Well rested'
		});

		await actions.default?.(at(task.id, ada, post));
		await expect(readSelfTaskRow(db, task.id)).resolves.toMatchObject({
			title: null,
			description: null,
			completionMessages: null,
			ciphertext: post.ciphertext
		});
	});

	it("404s for another user's task", async () => {
		const jun = await createTestUser(db, { name: 'Jun' });
		const theirs = await createTestSelfTask(db, jun);
		const post = await sealedPost(theirs.id);

		const result = await runAndCatch(() => actions.default?.(at(theirs.id, ada, post)));
		expect(result).toMatchObject({ type: 'error', status: 404 });
		await expect(readSelfTaskRow(db, theirs.id)).resolves.toMatchObject({
			ciphertext: theirs.ciphertext
		});
	});
});
