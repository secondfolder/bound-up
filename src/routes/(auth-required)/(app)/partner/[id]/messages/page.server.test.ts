import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markThreadOpened } from '$lib/server/messaging';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestThread,
	createTestUser,
	createTestUserKeys,
	type TestUser
} from '$lib/testing/fixtures';
import { load } from './+page.server';

/**
 * The board's `?thread=`, which is where a push notification's tap lands.
 * See `notifyPartner` in `$lib/server/push`.
 */

let harness: TestDb;
let ada: TestUser;
let bo: TestUser;
let partnershipId: string;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	bo = await createTestUser(harness.db, { name: 'Bo' });
	await createTestUserKeys(harness.db, ada);
	await createTestUserKeys(harness.db, bo);
	({ id: partnershipId } = await createTestPartnership(harness.db, ada, bo));
});

afterEach(() => harness.close());

function boardFor(viewer: TestUser, query = '') {
	return load(
		fakeEvent({
			db: harness.db,
			user: viewer,
			params: { id: partnershipId },
			path: `/partner/${partnershipId}/messages${query}`
		})
	);
}

describe('/partner/[id]/messages?thread=', () => {
	it('highlights a thread the viewer has never opened, on the board', async () => {
		const { threadId } = await createTestThread(harness.db, partnershipId, ada);
		const data = await runLoad(boardFor(bo, `?thread=${threadId}`));
		expect(data.highlightThreadId).toBe(threadId);
	});

	it('sends a thread the viewer has opened straight to it', async () => {
		const { threadId } = await createTestThread(harness.db, partnershipId, ada);
		await markThreadOpened(harness.db, threadId, bo.id);

		const result = await runAndCatch(() => boardFor(bo, `?thread=${threadId}`));
		expect(result).toMatchObject({
			type: 'redirect',
			status: 303,
			location: `/partner/${partnershipId}/messages/${threadId}`
		});
	});

	/**
	 * Opened is per person. The sender's own row must not count for the
	 * recipient, or every reply would skip the board.
	 */
	it('counts only the viewer having opened it, not the other member', async () => {
		const { threadId } = await createTestThread(harness.db, partnershipId, ada);
		await markThreadOpened(harness.db, threadId, ada.id);
		const data = await runLoad(boardFor(bo, `?thread=${threadId}`));
		expect(data.highlightThreadId).toBe(threadId);
	});

	it('ignores a thread that is not in this partnership', async () => {
		const carol = await createTestUser(harness.db, { name: 'Carol' });
		await createTestUserKeys(harness.db, carol);
		const other = await createTestPartnership(harness.db, ada, carol);
		const { threadId } = await createTestThread(harness.db, other.id, ada);

		const data = await runLoad(boardFor(bo, `?thread=${threadId}`));
		expect(data.highlightThreadId).toBeNull();
	});

	it('highlights nothing without the query', async () => {
		await createTestThread(harness.db, partnershipId, ada);
		const data = await runLoad(boardFor(bo));
		expect(data.highlightThreadId).toBeNull();
	});
});
