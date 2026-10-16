import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { completePartnershipTask } from '$lib/server/tasks';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestPartnershipTask,
	createTestUser,
	type TestUser
} from '$lib/testing/fixtures';
import { load } from './+page.server';

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

const at = (id: string, user: TestUser | null) =>
	fakeEvent({ db, user, params: { id }, path: `/partner/${id}/tasks/history` });

describe('load', () => {
	it('returns the partnership task completion history for a member', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const task = await createTestPartnershipTask(db, id, jun, {
			creditsAwarded: 2,
			completionMessageCount: 1
		});
		await completePartnershipTask(db, {
			partnershipId: id,
			taskId: task.id,
			userId: ada.id,
			viewerTimezone: ada.timezone
		});

		const data = await runLoad(load(at(id, ada)));
		expect(data.completions).toContainEqual(
			expect.objectContaining({
				mine: true,
				createdByMe: false,
				// The task's sealed record as it was, and which of its one message was picked.
				sealed: expect.objectContaining({ recordId: task.id, ciphertext: task.ciphertext }),
				completionMessageIndex: 0
			})
		);
	});
});
