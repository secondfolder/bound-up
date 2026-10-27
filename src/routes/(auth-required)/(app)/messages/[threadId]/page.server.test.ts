import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotifier } from '$lib/server/realtime/backend';
import { partnershipRoom } from '$lib/server/realtime/index';
import { soloSpaceFor } from '$lib/server/spaces';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
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
		openThread: async (...args: Parameters<typeof actual.openThread>) => {
			await new Promise((done) => setTimeout(done, 50));
			return actual.openThread(...args);
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

describe('/messages/[threadId]', () => {
	it('has marked the thread read by the time the page loads', async () => {
		const { threadId } = await createTestThread(harness.db, partnershipId, ada);

		await runLoad(
			load(
				fakeEvent({
					db: harness.db,
					user: bo,
					params: { threadId },
					path: `/messages/${threadId}`
				})
			)
		);

		// Straight back to the board, with nothing in between.
		const board = await runLoad(
			boardLoad(
				fakeEvent({
					db: harness.db,
					user: bo,
					path: '/messages'
				})
			)
		);
		const threads: { id: string; unread: boolean }[] = board.threads;
		expect(threads.find((thread) => thread.id === threadId)?.unread).toBe(false);
	});

	/**
	 * The thread opens at the oldest message the viewer has not read, which
	 * only the read mark from before this load can say: the load moves it.
	 */
	it('says which message is the oldest unread, from the read mark as it was', async () => {
		const { threadId } = await createTestThread(harness.db, partnershipId, ada, {
			at: new Date(1000)
		});
		const open = async () => {
			const data = await runLoad(
				load(
					fakeEvent({
						db: harness.db,
						user: bo,
						params: { threadId },
						path: `/messages/${threadId}`
					})
				)
			);
			return {
				firstUnreadId: data.firstUnreadId,
				ids: data.thread.messages.map((message: { id: string }) => message.id)
			};
		};

		// Never opened: everything the partner wrote is unread.
		const first = await open();
		expect(first.firstUnreadId).toBe(first.ids[0]);

		// Read now, so nothing is.
		expect((await open()).firstUnreadId).toBeNull();

		// Bo's own reply is never unread to them; Ada's after it are.
		await createTestMessage(harness.db, partnershipId, threadId, bo, { at: new Date(2000) });
		await createTestMessage(harness.db, partnershipId, threadId, ada, { at: new Date(3000) });
		await createTestMessage(harness.db, partnershipId, threadId, ada, { at: new Date(4000) });
		const later = await open();
		expect(later.firstUnreadId).toBe(later.ids[2]);
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
						params: { threadId },
						path: `/messages/${threadId}`
					})
				)
			);

		try {
			await open();
			expect(publish).toHaveBeenCalledExactlyOnceWith(
				partnershipRoom(partnershipId),
				'messages',
				JSON.stringify({ kind: 'read', threadId })
			);

			publish.mockClear();
			await open();
			expect(publish).not.toHaveBeenCalled();

			await createTestMessage(harness.db, partnershipId, threadId, ada, { at: new Date(2000) });
			await open();
			expect(publish).toHaveBeenCalledExactlyOnceWith(
				partnershipRoom(partnershipId),
				'messages',
				JSON.stringify({ kind: 'read', threadId })
			);
		} finally {
			publish.mockRestore();
		}
	});

	/**
	 * A thread takes its partnership from itself, never from the context: a
	 * notification's link opens the same thread whatever the device is
	 * looking at, and leaves the context alone (docs/contexts.md).
	 */
	it('opens a thread whatever the context says', async () => {
		const { threadId } = await createTestThread(harness.db, partnershipId, ada);
		const solo = defined(await soloSpaceFor(harness.db, bo.id), 'solo space');
		const cy = await createTestUser(harness.db, { name: 'Cy' });
		await createTestUserKeys(harness.db, cy);
		const other = await createTestPartnership(harness.db, bo, cy);

		for (const context of ['all', solo, other.id, partnershipId]) {
			const data = await runLoad(
				load(
					fakeEvent({
						db: harness.db,
						user: bo,
						params: { threadId },
						path: `/messages/${threadId}`,
						contextCookie: context
					})
				)
			);
			expect(data.partner.id).toBe(partnershipId);
			expect(data.thread.id).toBe(threadId);
		}
	});

	it('is a 404 for a thread the viewer is not in, and for no thread at all', async () => {
		const { threadId } = await createTestThread(harness.db, partnershipId, ada);
		const cy = await createTestUser(harness.db, { name: 'Cy' });
		const open = (viewer: TestUser, id: string) =>
			runAndCatch(() =>
				load(
					fakeEvent({
						db: harness.db,
						user: viewer,
						params: { threadId: id },
						path: `/messages/${id}`
					})
				)
			);
		await expect(open(cy, threadId)).resolves.toMatchObject({ type: 'error', status: 404 });
		await expect(open(bo, crypto.randomUUID())).resolves.toMatchObject({
			type: 'error',
			status: 404
		});
	});
});
