import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotifier } from '$lib/server/realtime/backend';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runLoad } from '$lib/testing/events';
import {
	createTestMessage,
	createTestPartnership,
	createTestThread,
	createTestUser,
	createTestUserKeys,
	type TestUser
} from '$lib/testing/fixtures';
import { load as boardLoad } from '../+page.server';
import { load } from './+page.server';

// A write that takes a moment, as a D1 round trip does. Locally the real one
// is queued on the same connection ahead of the board's query, so a load that
// forgot to wait for it would still pass; slowed, it cannot.
vi.mock('$lib/server/messaging', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/messaging')>();
	return {
		...actual,
		markThreadOpened: async (...args: Parameters<typeof actual.markThreadOpened>) => {
			await new Promise((done) => setTimeout(done, 50));
			return actual.markThreadOpened(...args);
		}
	};
});

/**
 * Opening a thread is what marks it read, and it has to be done by the time
 * the page is. The write used to be left running after the response: Workers
 * may cancel work a request does not wait for, and going straight back to the
 * board could load it before the write landed, so a thread just read still
 * showed as unread.
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

describe('/partner/[id]/messages/[threadId]', () => {
	it('has marked the thread read by the time the page loads', async () => {
		const { threadId } = await createTestThread(harness.db, partnershipId, ada);

		await runLoad(
			load(
				fakeEvent({
					db: harness.db,
					user: bo,
					params: { id: partnershipId, threadId },
					path: `/partner/${partnershipId}/messages/${threadId}`
				})
			)
		);

		// Straight back to the board, with nothing in between.
		const board = await runLoad(
			boardLoad(
				fakeEvent({
					db: harness.db,
					user: bo,
					params: { id: partnershipId },
					path: `/partner/${partnershipId}/messages`
				})
			)
		);
		const threads: { id: string; unread: boolean }[] = board.threads;
		expect(threads.find((thread) => thread.id === threadId)?.unread).toBe(false);
	});

	/**
	 * Opening a thread tells a partner watching it that their read receipt
	 * moved, and a reopen with nothing new does not: this load re-runs on every
	 * event about its thread, so publishing each time would have two open
	 * pages answering each other for ever.
	 */
	it('publishes a read event only when the read mark moves', async () => {
		const notifier = await createNotifier({});
		const publish = vi.spyOn(notifier, 'publish');
		// Explicit times, so the reply is newer even inside one millisecond.
		const { threadId } = await createTestThread(harness.db, partnershipId, ada, {
			at: new Date(1000)
		});
		const open = () =>
			runLoad(
				load(
					fakeEvent({
						db: harness.db,
						user: bo,
						params: { id: partnershipId, threadId },
						path: `/partner/${partnershipId}/messages/${threadId}`
					})
				)
			);

		try {
			await open();
			expect(publish).toHaveBeenCalledExactlyOnceWith(partnershipId, { kind: 'read', threadId });

			publish.mockClear();
			await open();
			expect(publish).not.toHaveBeenCalled();

			await createTestMessage(harness.db, partnershipId, threadId, ada, { at: new Date(2000) });
			await open();
			expect(publish).toHaveBeenCalledExactlyOnceWith(partnershipId, { kind: 'read', threadId });
		} finally {
			publish.mockRestore();
		}
	});
});
