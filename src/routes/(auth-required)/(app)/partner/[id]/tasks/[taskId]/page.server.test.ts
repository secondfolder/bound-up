import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestPartnershipTask,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readPartnershipTaskRow,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

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

const at = (id: string, taskId: string, user: TestUser | null, formData?: Record<string, string>) =>
	fakeEvent({
		db,
		user,
		params: { id, taskId },
		formData,
		path: `/partner/${id}/tasks/${taskId}`
	});

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
async function sealedPost(
	partnershipId: string,
	taskId: string,
	overrides: Record<string, string> = {}
) {
	return {
		...oneOffSettings,
		timezoneOwnerUserId: ada.id,
		recordId: taskId,
		vaultId: await ensureTestPartnershipVault(db, partnershipId),
		ciphertext: fakeSealed('edited'),
		payloadVersion: '1',
		completionMessageCount: '1',
		expectedRevision: '0',
		...overrides
	};
}

describe('load', () => {
	it('loads one existing partnership task for its creator on the managing side', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada, { creditsAwarded: 4 });

		await expect(runLoad(load(at(id, task.id, ada)))).resolves.toMatchObject({
			partner: {
				id,
				names: expect.objectContaining({ partnershipId: id, role: 'inviter' }),
				canManageTasks: true
			},
			task: {
				id: task.id,
				revision: 0,
				sealed: { recordId: task.id, ciphertext: task.ciphertext }
			},
			// The settings fill the form; the sealed content is the page's to open.
			taskForm: { data: expect.objectContaining({ title: '', creditsAwarded: '4' }) }
		});
	});

	it('403s for the other partner under shared control', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada);
		const result = await runAndCatch(() => runLoad(load(at(id, task.id, jun))));
		expect(result).toMatchObject({ type: 'error', status: 403 });
	});
});

describe('actions', () => {
	it('updates a partnership task for its creator and bumps its revision', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada, { creditsAwarded: 2 });
		const post = await sealedPost(id, task.id, { completionMessageCount: '2' });

		const result = await actions.default?.(at(id, task.id, ada, post));
		expect(result).toEqual({ saved: true });
		await expect(readPartnershipTaskRow(db, task.id)).resolves.toMatchObject({
			ciphertext: post.ciphertext,
			completionMessageCount: 2,
			revision: 1,
			creditsAwarded: 3
		});
	});

	it('refuses an edit against a stale revision with a 409', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada, { creditsAwarded: 2 });
		const first = await sealedPost(id, task.id);
		await actions.default?.(at(id, task.id, ada, first));

		const stale = await sealedPost(id, task.id, { creditsAwarded: '9' });
		const result = await runAndCatch(() => actions.default?.(at(id, task.id, ada, stale)));
		expect(result).toMatchObject({
			type: 'ok',
			value: { status: 409, data: { error: expect.any(String) } }
		});
		await expect(readPartnershipTaskRow(db, task.id)).resolves.toMatchObject({
			ciphertext: first.ciphertext,
			creditsAwarded: 3,
			revision: 1
		});
	});

	it('refuses a post whose recordId is not the task in the URL', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada);
		const other = await createTestPartnershipTask(db, id, ada);
		const post = await sealedPost(id, other.id);

		const result = await runAndCatch(() => actions.default?.(at(id, task.id, ada, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 400 } });
		await expect(readPartnershipTaskRow(db, task.id)).resolves.toMatchObject({
			ciphertext: task.ciphertext
		});
		await expect(readPartnershipTaskRow(db, other.id)).resolves.toMatchObject({
			ciphertext: other.ciphertext
		});
	});

	it("refuses content sealed in another scope's vault", async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada);
		const post = await sealedPost(id, task.id, { vaultId: await ensureTestSelfVault(db, ada.id) });

		const result = await runAndCatch(() => actions.default?.(at(id, task.id, ada, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 409 } });
		await expect(readPartnershipTaskRow(db, task.id)).resolves.toMatchObject({
			ciphertext: task.ciphertext,
			revision: 0
		});
	});

	it('does not store a title the post still carries', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada);
		const post = await sealedPost(id, task.id, {
			title: 'Tea time',
			description: 'Partner task description',
			completionMessagesText: 'Nicely done'
		});

		await actions.default?.(at(id, task.id, ada, post));
		const row = await readPartnershipTaskRow(db, task.id);
		expect(row).toMatchObject({
			ciphertext: post.ciphertext
		});
		// Only the sealed record is kept: there is nowhere for the text to go.
		expect(JSON.stringify(row)).not.toContain('Tea time');
	});

	it('403s when the other partner posts an edit under shared control', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada, { creditsAwarded: 2 });
		const post = await sealedPost(id, task.id);

		const result = await runAndCatch(() => actions.default?.(at(id, task.id, jun, post)));
		expect(result).toMatchObject({ type: 'error', status: 403 });
		await expect(readPartnershipTaskRow(db, task.id)).resolves.toMatchObject({
			ciphertext: task.ciphertext
		});
	});
});
