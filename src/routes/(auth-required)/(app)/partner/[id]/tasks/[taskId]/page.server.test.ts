import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestPartnershipTask,
	createTestUser,
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

describe('load', () => {
	it('loads one existing partnership task for its creator on the managing side', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada, { title: 'Tea' });

		await expect(runLoad(load(at(id, task.id, ada)))).resolves.toMatchObject({
			partner: { id, name: 'Them', canManageTasks: true },
			taskForm: { data: expect.objectContaining({ title: 'Tea' }) }
		});
	});

	it('403s for the other partner under shared control', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada, { title: 'Tea' });
		const result = await runAndCatch(() => runLoad(load(at(id, task.id, jun))));
		expect(result).toMatchObject({ type: 'error', status: 403 });
	});
});

describe('actions', () => {
	it('updates a partnership task for its creator', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada, { title: 'Tea', creditsAwarded: 2 });

		const result = await actions.default?.(
			at(id, task.id, ada, {
				title: 'Tea time',
				description: 'Partner task description',
				creditsAwarded: '3',
				completionMessagesText: 'Nicely done',
				timezoneOwnerUserId: ada.id,
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
			})
		);
		expect(result).toMatchObject({ form: expect.any(Object) });
		await expect(readPartnershipTaskRow(db, task.id)).resolves.toMatchObject({
			title: 'Tea time',
			creditsAwarded: 3
		});
	});

	it('403s when the other partner posts an edit under shared control', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada, { title: 'Tea', creditsAwarded: 2 });

		const result = await runAndCatch(() =>
			actions.default?.(
				at(id, task.id, jun, {
					title: 'Tea time',
					description: 'Partner task description',
					creditsAwarded: '2',
					completionMessagesText: 'Nicely done',
					timezoneOwnerUserId: ada.id,
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
				})
			)
		);
		expect(result).toMatchObject({ type: 'error', status: 403 });
	});
});
