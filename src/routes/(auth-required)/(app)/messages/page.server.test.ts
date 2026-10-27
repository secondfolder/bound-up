import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markThreadOpened } from '$lib/server/messaging';
import { soloSpaceFor } from '$lib/server/spaces';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestThread,
	createTestUser,
	createTestUserKeys,
	type TestUser
} from '$lib/testing/fixtures';
import type { BoardPartnershipView, ThreadStickerView } from '$lib/types';
import { load } from './+page.server';

/**
 * The board in each context (docs/messaging.md, "The board in each context"),
 * and its `?thread=`.
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

function boardFor(viewer: TestUser, options: { query?: string; context?: string } = {}) {
	return load(
		fakeEvent({
			db: harness.db,
			user: viewer,
			path: `/messages${options.query ?? ''}`,
			...(options.context === undefined ? {} : { contextCookie: options.context })
		})
	);
}

/** A second partner for Bo, with a thread in it. */
async function secondPartnership() {
	const cy = await createTestUser(harness.db, { name: 'Cy' });
	await createTestUserKeys(harness.db, cy);
	const { id } = await createTestPartnership(harness.db, bo, cy);
	return { cy, id };
}

describe('/messages, in each context', () => {
	it('shows one partnership’s board in its context', async () => {
		const other = await secondPartnership();
		const mine = await createTestThread(harness.db, partnershipId, ada);
		await createTestThread(harness.db, other.id, other.cy);

		const data = await runLoad(boardFor(bo, { context: partnershipId }));
		expect(data.view).toBe('board');
		expect(data.context).toEqual({ kind: 'space', spaceId: partnershipId });
		expect(data.partnerships.map((partnership: BoardPartnershipView) => partnership.id)).toEqual([
			partnershipId
		]);
		expect(data.threads.map((thread: ThreadStickerView) => thread.id)).toEqual([mine.threadId]);
		expect(data.threads[0]?.spaceId).toBe(partnershipId);
	});

	it('shows every partnership’s threads in Everyone, each saying whose it is', async () => {
		const other = await secondPartnership();
		const withAda = await createTestThread(harness.db, partnershipId, ada, { at: new Date(1000) });
		const withCy = await createTestThread(harness.db, other.id, other.cy, { at: new Date(2000) });

		const data = await runLoad(boardFor(bo, { context: 'all' }));
		expect(data.view).toBe('board');
		expect(
			data.partnerships.map((partnership: BoardPartnershipView) => partnership.id).sort()
		).toEqual([partnershipId, other.id].sort());
		// One board, in the board's own order: newest unread first.
		expect(data.threads.map((thread: ThreadStickerView) => [thread.id, thread.spaceId])).toEqual([
			[withCy.threadId, other.id],
			[withAda.threadId, partnershipId]
		]);
	});

	it('is Everyone for a device that has never switched', async () => {
		const other = await secondPartnership();
		await createTestThread(harness.db, other.id, other.cy);
		await createTestThread(harness.db, partnershipId, ada);
		const data = await runLoad(boardFor(bo));
		expect(data.context).toEqual({ kind: 'all' });
		expect(data.threads).toHaveLength(2);
	});

	it('shows no messages in Me, and offers nothing to send to', async () => {
		await createTestThread(harness.db, partnershipId, ada);
		const solo = defined(await soloSpaceFor(harness.db, bo.id), 'solo space');

		const data = await runLoad(boardFor(bo, { context: solo }));
		expect(data.view).toBe('me');
		expect(data.partnerships).toEqual([]);
		expect(data.threads).toEqual([]);
	});

	it('has nobody to show without a partner', async () => {
		const loner = await createTestUser(harness.db, { name: 'Lone' });
		const data = await runLoad(boardFor(loner));
		expect(data.view).toBe('board');
		expect(data.partnerships).toEqual([]);
		expect(data.threads).toEqual([]);
	});

	/** An ambient context never 404s: someone else's partnership reads as Everyone. */
	it('falls back to Everyone for a partnership the viewer is not in', async () => {
		const cy = await createTestUser(harness.db, { name: 'Cy' });
		const theirs = await createTestPartnership(harness.db, ada, cy);
		await createTestThread(harness.db, theirs.id, ada);
		const mine = await createTestThread(harness.db, partnershipId, ada);

		const data = await runLoad(boardFor(bo, { context: theirs.id }));
		expect(data.context).toEqual({ kind: 'all' });
		expect(data.threads.map((thread: ThreadStickerView) => thread.id)).toEqual([mine.threadId]);
	});

	it('carries each partnership’s keys, requests and tags', async () => {
		const data = await runLoad(boardFor(bo, { context: partnershipId }));
		const [board] = data.partnerships;
		expect(board).toMatchObject({ id: partnershipId, restoreRequests: [], tags: [] });
		expect(board?.recipients).toBeTruthy();
	});
});

/** Where a `?thread=` link lands: a never-opened thread rung on the board, else the thread. */
describe('/messages?thread=', () => {
	it('highlights a thread the viewer has never opened, on the board', async () => {
		const { threadId } = await createTestThread(harness.db, partnershipId, ada);
		const data = await runLoad(boardFor(bo, { query: `?thread=${threadId}` }));
		expect(data.highlightThreadId).toBe(threadId);
	});

	it('sends a thread the viewer has opened straight to it', async () => {
		const { threadId } = await createTestThread(harness.db, partnershipId, ada);
		await markThreadOpened(harness.db, threadId, bo.id);

		const result = await runAndCatch(() => boardFor(bo, { query: `?thread=${threadId}` }));
		expect(result).toMatchObject({
			type: 'redirect',
			status: 303,
			location: `/messages/${threadId}`
		});
	});

	/**
	 * Opened is per person. The sender's own row must not count for the
	 * recipient, or every reply would skip the board.
	 */
	it('counts only the viewer having opened it, not the other member', async () => {
		const { threadId } = await createTestThread(harness.db, partnershipId, ada);
		await markThreadOpened(harness.db, threadId, ada.id);
		const data = await runLoad(boardFor(bo, { query: `?thread=${threadId}` }));
		expect(data.highlightThreadId).toBe(threadId);
	});

	it('ignores a thread that is not on this board', async () => {
		const carol = await createTestUser(harness.db, { name: 'Carol' });
		await createTestUserKeys(harness.db, carol);
		const other = await createTestPartnership(harness.db, ada, carol);
		const { threadId } = await createTestThread(harness.db, other.id, ada);

		const data = await runLoad(boardFor(bo, { query: `?thread=${threadId}` }));
		expect(data.highlightThreadId).toBeNull();
	});

	it('highlights nothing without the query', async () => {
		await createTestThread(harness.db, partnershipId, ada);
		const data = await runLoad(boardFor(bo));
		expect(data.highlightThreadId).toBeNull();
	});
});
