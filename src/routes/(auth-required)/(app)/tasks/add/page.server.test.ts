import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestInvite,
	createTestPartnership,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readTaskRow,
	type TestUser,
	testSoloSpace
} from '$lib/testing/fixtures';
import { load as layoutLoad } from '../+layout.server';
import { actions, load } from './+page.server';

/**
 * Adding a task: to the space the form names, which the server checks the
 * viewer may set tasks in, and never to wherever the context points.
 */

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;
let kit: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada', timezone: 'Europe/London' });
	jun = await createTestUser(db, { name: 'Jun', timezone: 'America/New_York' });
	kit = await createTestUser(db, { name: 'Kit' });
});

afterEach(() => harness.close());

/** The add page's load, with the list layout's data as its parent, in a context. */
async function loadIn(user: TestUser, context: string) {
	const layout = await runLoad(
		layoutLoad(fakeEvent({ db, user, path: '/tasks', contextCookie: context }))
	);
	return await runAndCatch(() =>
		runLoad(
			load(fakeEvent({ db, user, path: '/tasks/add', contextCookie: context, parentData: layout }))
		)
	);
}

const post = (user: TestUser | null, formData: Record<string, string>, context?: string) =>
	runAndCatch(() =>
		actions.default?.(
			fakeEvent({
				db,
				user,
				path: '/tasks/add',
				formData,
				...(context ? { contextCookie: context } : {})
			})
		)
	);

/** A new task as the browser posts it: one-off settings, the content sealed, and its space. */
function sealedPost(spaceId: string, vaultId: string, overrides: Record<string, string> = {}) {
	return {
		spaceId,
		creditsAwarded: '2',
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
		timezoneOwnerUserId: ada.id,
		recordId: crypto.randomUUID(),
		vaultId,
		ciphertext: fakeSealed('task'),
		payloadVersion: '1',
		completionMessageCount: '1',
		...overrides
	};
}

describe('load', () => {
	it('opens wherever there is somewhere to add one', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		await expect(loadIn(ada, 'all')).resolves.toMatchObject({
			value: { taskForm: expect.anything() }
		});
		await expect(loadIn(ada, id)).resolves.toMatchObject({
			value: { taskForm: expect.anything() }
		});
	});

	it('sends the side that only completes back to the list', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		await expect(loadIn(jun, id)).resolves.toMatchObject({
			type: 'redirect',
			status: 303,
			location: '/tasks'
		});
	});
});

describe('the action', () => {
	it('creates a task of your own, for you, in your own space', async () => {
		const solo = await testSoloSpace(db, ada.id);
		const form = sealedPost(solo, await ensureTestSelfVault(db, ada.id));
		await expect(post(ada, form)).resolves.toMatchObject({ status: 303, location: '/tasks' });
		await expect(readTaskRow(db, form.recordId)).resolves.toMatchObject({
			spaceId: solo,
			createdByUserId: ada.id,
			assigneeUserId: ada.id,
			ciphertext: form.ciphertext
		});
	});

	it('sets a task in a partnership for the partner, never for whoever set it', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const form = sealedPost(id, await ensureTestPartnershipVault(db, id), {
			timezoneOwnerUserId: jun.id
		});
		await expect(post(ada, form)).resolves.toMatchObject({ status: 303 });
		await expect(readTaskRow(db, form.recordId)).resolves.toMatchObject({
			spaceId: id,
			createdByUserId: ada.id,
			assigneeUserId: jun.id,
			timezoneOwnerUserId: jun.id
		});
	});

	it('goes where the form says, whatever the context', async () => {
		// Created from Everyone — or a tab whose context another tab changed to
		// Ada's own space — the form names the partnership, and that is where it goes.
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const form = sealedPost(id, await ensureTestPartnershipVault(db, id));
		await post(ada, form, await testSoloSpace(db, ada.id));
		await expect(readTaskRow(db, form.recordId)).resolves.toMatchObject({ spaceId: id });
	});

	it('refuses the side that does not set tasks, and a space you are not in', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const vaultId = await ensureTestPartnershipVault(db, id);
		await expect(post(jun, sealedPost(id, vaultId))).resolves.toMatchObject({
			value: { status: 403 }
		});

		const theirs = (await createTestPartnership(db, jun, kit)).id;
		const form = sealedPost(theirs, await ensureTestPartnershipVault(db, theirs));
		await expect(post(ada, form)).resolves.toMatchObject({ value: { status: 404 } });
		await expect(readTaskRow(db, form.recordId)).resolves.toBeUndefined();
	});

	it('refuses a pending invite, which has nobody to set it for', async () => {
		const invite = await createTestInvite(db, ada);
		const form = sealedPost(invite.id, await ensureTestPartnershipVault(db, invite.id));
		await expect(post(ada, form)).resolves.toMatchObject({ value: { status: 404 } });
	});

	it('refuses a post naming no space', async () => {
		const form = sealedPost('', await ensureTestSelfVault(db, ada.id));
		await expect(post(ada, form)).resolves.toMatchObject({ value: { status: 400 } });
		await expect(readTaskRow(db, form.recordId)).resolves.toBeUndefined();
	});
});
