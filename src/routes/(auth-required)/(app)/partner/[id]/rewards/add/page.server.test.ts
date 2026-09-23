import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestInvite,
	createTestPartnership,
	createTestUser,
	readPartnershipRewardRows,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;
let stranger: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
	stranger = await createTestUser(db, { name: 'Stranger' });
});

afterEach(() => harness.close());

const at = (id: string, user: TestUser | null, formData?: Record<string, string>) =>
	fakeEvent({ db, user, params: { id }, formData, path: `/partner/${id}/rewards/add` });

describe('load', () => {
	it('lets the controlling side open the add page', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		await expect(runLoad(load(at(id, ada)))).resolves.toMatchObject({
			partner: { id, name: 'Them' }
		});
	});

	it('403s for the non-controlling side', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const result = await runAndCatch(() => runLoad(load(at(id, jun))));
		expect(result).toMatchObject({ type: 'error', status: 403 });
	});

	it('404s for a pending invite or stranger', async () => {
		const invite = await createTestInvite(db, ada);
		const pending = await runAndCatch(() => runLoad(load(at(invite.id, ada))));
		expect(pending).toMatchObject({ type: 'error', status: 404 });

		const { id } = await createTestPartnership(db, ada, jun);
		const strangerResult = await runAndCatch(() => runLoad(load(at(id, stranger))));
		expect(strangerResult).toMatchObject({ type: 'error', status: 404 });
	});
});

describe('actions', () => {
	it('creates a reward and redirects back to the rewards page', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const result = await runAndCatch(() =>
			actions.default?.(
				at(id, ada, {
					title: 'Movie night',
					description: 'Pick a film',
					cost: '3',
					active: 'on'
				})
			)
		);

		expect(result).toMatchObject({
			type: 'redirect',
			status: 303,
			location: `/partner/${id}/rewards`
		});
		await expect(readPartnershipRewardRows(db, id)).resolves.toContainEqual(
			expect.objectContaining({ title: 'Movie night', createdByUserId: ada.id })
		);
	});
});
