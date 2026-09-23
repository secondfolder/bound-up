import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { completeSelfTask } from '$lib/server/tasks';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runLoad } from '$lib/testing/events';
import { createTestSelfTask, createTestUser, type TestUser } from '$lib/testing/fixtures';
import { load } from './+page.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada', timezone: 'Europe/London' });
});

afterEach(() => harness.close());

const at = (user: TestUser | null) => fakeEvent({ db, user, path: '/home/tasks/history' });

describe('load', () => {
	it('returns the self task completion history', async () => {
		const task = await createTestSelfTask(db, ada, {
			title: 'Nap',
			creditsAwarded: 2,
			completionMessages: ['Done']
		});
		await completeSelfTask(db, ada.id, ada.timezone, task.id);

		const data = await runLoad(load(at(ada)));
		expect(data.selfTasks.completions).toContainEqual(
			expect.objectContaining({ taskTitle: 'Nap', creditsAwarded: 2 })
		);
	});
});
