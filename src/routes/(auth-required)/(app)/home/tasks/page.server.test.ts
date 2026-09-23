import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestPartnershipTask,
	createTestSelfTask,
	createTestUser,
	readPartnershipRewardCreditRow,
	readSelfRewardCreditRow,
	readSelfTaskRow,
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

function at(
	user: TestUser | null,
	formData?: Record<string, string>,
	partners = [] as { id: string; name: string; image: string | null }[]
) {
	return fakeEvent({ db, user, formData, path: '/home/tasks', parentData: { partners } });
}

const run = (name: string, event: never) => runAction(actions, name, event);

describe('load', () => {
	it('returns self tasks and partner sections', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		await createTestSelfTask(db, ada, { title: 'Self task' });
		await createTestPartnershipTask(db, id, jun, {
			title: 'Partner task',
			timezoneOwnerUserId: jun.id
		});

		const data = await runLoad(load(at(ada, undefined, [{ id, name: 'Jun', image: null }])));
		expect(data.selfTasks.tasks).toContainEqual(expect.objectContaining({ title: 'Self task' }));
		expect(data.partnerTasks).toContainEqual(
			expect.objectContaining({
				partnershipId: id,
				name: 'Jun',
				tasks: [expect.objectContaining({ title: 'Partner task' })]
			})
		);
	});

	it('degrades to an empty tasks page without a session', async () => {
		await expect(runLoad(load(at(null)))).resolves.toEqual({
			selfTasks: { tasks: [], completions: [] },
			partnerTasks: []
		});
	});
});

describe('actions', () => {
	it('completes a self task from the tasks hub', async () => {
		const task = await createTestSelfTask(db, ada, { title: 'Nap', creditsAwarded: 2 });

		const result = await run('selfCompleteTask', at(ada, { taskId: task.id }));
		expect(result).toMatchObject({ message: 'Task completed.' });
		await expect(readSelfRewardCreditRow(db, ada.id)).resolves.toMatchObject({ credits: 2 });
		await expect(readSelfTaskRow(db, task.id)).resolves.toMatchObject({ active: false });
	});

	it('completes a partner task from the home tasks hub', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const task = await createTestPartnershipTask(db, id, jun, { title: 'Tea', creditsAwarded: 3 });

		const result = await run(
			'partnerCompleteTask',
			at(ada, { partnershipId: id, taskId: task.id }, [{ id, name: 'Jun', image: null }])
		);
		expect(result).toMatchObject({ message: 'Task completed.' });
		await expect(readPartnershipRewardCreditRow(db, id, ada.id)).resolves.toMatchObject({
			credits: 3
		});
	});

	it('401s without a session when an action runs', async () => {
		const result = await runAndCatch(() =>
			run('selfCompleteTask', at(null, { taskId: crypto.randomUUID() }))
		);
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});
});
