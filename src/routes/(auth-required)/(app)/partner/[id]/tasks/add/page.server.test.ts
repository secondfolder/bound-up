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
	readPartnershipTaskRow,
	readPartnershipTaskRows,
	type TestUser
} from '$lib/testing/fixtures';
import { actions } from './+page.server';

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

const at = (id: string, user: TestUser | null, formData?: Record<string, string>) =>
	fakeEvent({ db, user, params: { id }, formData, path: `/partner/${id}/tasks/add` });

/** A new task as the browser posts it: one-off settings, and the content sealed. */
async function sealedPost(partnershipId: string, overrides: Record<string, string> = {}) {
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
		timezoneOwnerUserId: jun.id,
		recordId: crypto.randomUUID(),
		vaultId: await ensureTestPartnershipVault(db, partnershipId),
		ciphertext: fakeSealed('task'),
		payloadVersion: '1',
		completionMessageCount: '1',
		...overrides
	};
}

describe('actions', () => {
	it('creates the task under the id the browser chose and redirects', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const post = await sealedPost(id);
		const result = await runAndCatch(() => actions.default?.(at(id, ada, post)));

		expect(result).toMatchObject({
			type: 'redirect',
			status: 303,
			location: `/partner/${id}/tasks`
		});
		await expect(readPartnershipTaskRow(db, post.recordId)).resolves.toMatchObject({
			partnershipId: id,
			createdByUserId: ada.id,
			ciphertext: post.ciphertext,
			vaultId: post.vaultId,
			revision: 0
		});
	});

	it('does not store a title the post still carries', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const post = await sealedPost(id, { title: 'Kneel at eight', description: 'Sharp' });
		await runAndCatch(() => actions.default?.(at(id, ada, post)));

		await expect(readPartnershipTaskRow(db, post.recordId)).resolves.toMatchObject({
			title: null,
			description: null,
			ciphertext: post.ciphertext
		});
	});

	it("refuses content sealed in another scope's vault", async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const stranger = await createTestUser(db, { name: 'Stranger' });
		const other = await createTestPartnership(db, ada, stranger, { control: 'me' });

		const postWithVault = async (vaultId: string) => {
			const post = await sealedPost(id, { vaultId });
			return await runAndCatch(() => actions.default?.(at(id, ada, post)));
		};

		const refused = { type: 'ok', value: { status: 409 } };
		await expect(postWithVault(await ensureTestSelfVault(db, ada.id))).resolves.toMatchObject(
			refused
		);
		await expect(
			postWithVault(await ensureTestPartnershipVault(db, other.id))
		).resolves.toMatchObject(refused);
		await expect(readPartnershipTaskRows(db, id)).resolves.toEqual([]);
	});

	it('403s for the non-controlling side', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const post = await sealedPost(id, { timezoneOwnerUserId: ada.id });

		const result = await runAndCatch(() => actions.default?.(at(id, jun, post)));
		expect(result).toMatchObject({ type: 'error', status: 403 });
		await expect(readPartnershipTaskRows(db, id)).resolves.toEqual([]);
	});
});
