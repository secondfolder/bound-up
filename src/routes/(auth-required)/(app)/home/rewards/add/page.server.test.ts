import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { getSelfRewardsSection } from '$lib/server/rewards';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { actions } from './+page.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
});

afterEach(() => harness.close());

const at = (user: TestUser | null, formData?: Record<string, string>) =>
	fakeEvent({ db, user, formData, path: '/home/rewards/add' });

describe('actions', () => {
	it('creates a self reward and redirects to home', async () => {
		const result = await runAndCatch(() =>
			actions.default?.(
				at(ada, {
					title: 'Bath',
					description: 'Hot bath',
					cost: '3',
					active: 'on'
				})
			)
		);

		expect(result).toMatchObject({ type: 'redirect', status: 303, location: '/home/rewards' });
		const section = await getSelfRewardsSection(db, ada.id);
		expect(section.rewards).toContainEqual(expect.objectContaining({ title: 'Bath', cost: 3 }));
	});

	it('401s without a session', async () => {
		const result = await runAndCatch(() =>
			actions.default?.(at(null, { title: 'Bath', description: '', cost: '3', active: 'on' }))
		);
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});
});
