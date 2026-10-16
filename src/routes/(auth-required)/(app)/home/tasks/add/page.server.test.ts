import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readSelfTaskRow,
	type TestUser
} from '$lib/testing/fixtures';
import { actions } from './+page.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada', timezone: 'Europe/London' });
});

afterEach(() => harness.close());

const at = (user: TestUser | null, formData?: Record<string, string>) =>
	fakeEvent({ db, user, formData, path: '/home/tasks/add' });

/** A new task as the browser posts it: one-off settings, and the content sealed. */
async function sealedPost(overrides: Record<string, string> = {}) {
	return {
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
		vaultId: await ensureTestSelfVault(db, ada.id),
		ciphertext: fakeSealed('task'),
		payloadVersion: '1',
		completionMessageCount: '2',
		...overrides
	};
}

describe('actions', () => {
	it('creates the task under the id the browser chose and redirects', async () => {
		const post = await sealedPost();
		const result = await runAndCatch(() => actions.default?.(at(ada, post)));

		expect(result).toMatchObject({ type: 'redirect', status: 303, location: '/home/tasks' });
		await expect(readSelfTaskRow(db, post.recordId)).resolves.toMatchObject({
			ownerId: ada.id,
			ciphertext: post.ciphertext,
			vaultId: post.vaultId,
			completionMessageCount: 2,
			revision: 0,
			creditsAwarded: 2
		});
	});

	it('does not store a title the post still carries', async () => {
		const post = await sealedPost({ title: 'Nap', description: 'Twenty minutes' });
		await runAndCatch(() => actions.default?.(at(ada, post)));

		await expect(readSelfTaskRow(db, post.recordId)).resolves.toMatchObject({
			title: '',
			description: null,
			ciphertext: post.ciphertext
		});
	});

	it("refuses content sealed in a partnership's vault", async () => {
		const jun = await createTestUser(db, { name: 'Jun' });
		const { id } = await createTestPartnership(db, ada, jun);
		const post = await sealedPost({ vaultId: await ensureTestPartnershipVault(db, id) });

		const result = await runAndCatch(() => actions.default?.(at(ada, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 409 } });
		await expect(readSelfTaskRow(db, post.recordId)).resolves.toBeUndefined();
	});

	it('refuses a post without sealed content', async () => {
		const { ciphertext: _dropped, ...post } = await sealedPost({ title: 'Nap' });
		const result = await runAndCatch(() => actions.default?.(at(ada, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 400 } });
		await expect(readSelfTaskRow(db, post.recordId)).resolves.toBeUndefined();
	});

	it('401s without a session', async () => {
		const result = await runAndCatch(() => actions.default?.(at(null, {})));
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});
});
