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
import { testPartnerView } from '$lib/testing/names';
import type { PartnerView } from '$lib/types';
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
	partners = [] as PartnerView[]
) {
	return fakeEvent({ db, user, formData, path: '/home/tasks', parentData: { partners } });
}

const run = (name: string, event: never) => runAction(actions, name, event);

describe('load', () => {
	it('returns self tasks and partner sections', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const own = await createTestSelfTask(db, ada);
		const theirs = await createTestPartnershipTask(db, id, jun, { timezoneOwnerUserId: jun.id });

		const data = await runLoad(load(at(ada, undefined, [testPartnerView(id, 'Jun')])));
		expect(data.selfTasks.tasks).toContainEqual(
			expect.objectContaining({
				id: own.id,
				sealed: expect.objectContaining({ ciphertext: own.ciphertext })
			})
		);
		expect(data.partnerTasks).toContainEqual(
			expect.objectContaining({
				partnershipId: id,
				names: testPartnerView(id, 'Jun').names,
				tasks: [
					expect.objectContaining({
						id: theirs.id,
						sealed: expect.objectContaining({ ciphertext: theirs.ciphertext })
					})
				]
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
		const task = await createTestSelfTask(db, ada, { creditsAwarded: 2 });

		const result = await run('selfCompleteTask', at(ada, { taskId: task.id }));
		expect(result).toMatchObject({ message: 'Task completed.' });
		await expect(readSelfRewardCreditRow(db, ada.id)).resolves.toMatchObject({ credits: 2 });
		await expect(readSelfTaskRow(db, task.id)).resolves.toMatchObject({ active: false });
	});

	it('completes a partner task from the home tasks hub', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const task = await createTestPartnershipTask(db, id, jun, { creditsAwarded: 3 });

		const result = await run(
			'partnerCompleteTask',
			at(ada, { partnershipId: id, taskId: task.id }, [testPartnerView(id, 'Jun')])
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
