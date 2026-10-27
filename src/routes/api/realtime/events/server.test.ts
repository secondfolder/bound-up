import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { entryTopic } from '$lib/notebook';
import { createNotifier } from '$lib/server/realtime/backend';
import { spaceRoom, userRoom } from '$lib/server/realtime/index';
import { publishMessagingEvent } from '$lib/server/realtime/messaging';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestNotebookEntry,
	createTestPartnership,
	createTestUser,
	type TestUser,
	testSoloSpace
} from '$lib/testing/fixtures';
import { POST } from '../presence/+server';
import { GET } from './+server';

/**
 * The live feed and its presence endpoint, over the in-process notifier.
 *
 * The lease and topic rules themselves are covered per backend in
 * `server/realtime/*.test.ts`; this is about what the endpoints let through:
 * which rooms and topics a viewer may open a stream on.
 */

let harness: TestDb;
let ada: TestUser;
let bo: TestUser;
let stranger: TestUser;
let partnershipId: string;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	bo = await createTestUser(harness.db, { name: 'Bo' });
	stranger = await createTestUser(harness.db, { name: 'Cy' });
	partnershipId = (await createTestPartnership(harness.db, ada, bo)).id;
});

afterEach(() => harness.close());

function openFeed(user: TestUser, query: string) {
	return GET(fakeEvent({ db: harness.db, user, path: `/api/realtime/events?${query}` }));
}

/** A query for the partnership's message board, plus whatever else. */
function boardQuery(extra: string) {
	return `room=${spaceRoom(partnershipId)}&topic=messages&${extra}`;
}

function presence(user: TestUser | null, json: unknown) {
	return POST(fakeEvent({ db: harness.db, user, json }));
}

async function watching() {
	const notifier = await createNotifier({});
	return await publishMessagingEvent(notifier, harness.db, partnershipId, { kind: 'thread' });
}

async function release(response: Response) {
	await defined(response.body, 'the stream body').cancel();
}

describe('GET /api/realtime/events', () => {
	it('refuses a stream without an id, since its lease could never be renewed', async () => {
		const result = await runAndCatch(() => openFeed(ada, boardQuery('')));
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	it.each([
		['no room', 'topic=messages'],
		['a room that is not one', 'room=group:abc&topic=messages'],
		['a room named the old way', 'room=partnership:abc&topic=messages'],
		['no topic', `room=space:${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}`],
		['a topic that could forge a frame', 'room=user:x&topic=messages%0Adata:x']
	])('refuses %s', async (_case, query) => {
		const result = await runAndCatch(() => openFeed(ada, `${query}&stream=${crypto.randomUUID()}`));
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	it('opens a stream that counts as its device watching the board', async () => {
		const stream = crypto.randomUUID();
		const device = crypto.randomUUID();
		const response = await openFeed(ada, boardQuery(`stream=${stream}&device=${device}`));

		expect(await watching()).toEqual([{ userId: ada.id, deviceId: device, streamId: stream }]);
		await release(response);
	});

	it('404s someone outside the partnership', async () => {
		const result = await runAndCatch(() =>
			openFeed(stranger, boardQuery(`stream=${crypto.randomUUID()}`))
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it("404s somebody else's own room", async () => {
		const result = await runAndCatch(() =>
			openFeed(bo, `room=${userRoom(ada.id)}&topic=notebook&stream=${crypto.randomUUID()}`)
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it('refuses messages in a space that is not a partnership', async () => {
		const solo = await testSoloSpace(harness.db, ada.id);
		const result = await runAndCatch(() =>
			openFeed(ada, `room=${spaceRoom(solo)}&topic=messages&stream=${crypto.randomUUID()}`)
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it.each([
		['a solo space', () => testSoloSpace(harness.db, ada.id)],
		['a partnership', () => Promise.resolve(partnershipId)]
	])("404s %s's room to someone who is not in it, even for its list", async (_case, spaceOf) => {
		const room = spaceRoom(await spaceOf());
		const result = await runAndCatch(() =>
			openFeed(stranger, `room=${room}&topic=notebook&stream=${crypto.randomUUID()}`)
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it("opens a member's own solo space for its list", async () => {
		const solo = await testSoloSpace(harness.db, ada.id);
		const response = await openFeed(
			ada,
			`room=${spaceRoom(solo)}&topic=notebook&stream=${crypto.randomUUID()}`
		);
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		await release(response);
	});

	describe("the viewer's own room, for Everyone", () => {
		it('opens the list topics there: messages and the notebook list, together', async () => {
			const response = await openFeed(
				ada,
				`room=${userRoom(ada.id)}&topic=messages&topic=notebook&stream=${crypto.randomUUID()}`
			);
			expect(response.headers.get('content-type')).toBe('text/event-stream');
			await release(response);
		});

		it('counts an Everyone board as watching every partnership it shows', async () => {
			const stream = crypto.randomUUID();
			const response = await openFeed(
				bo,
				`room=${userRoom(bo.id)}&topic=messages&stream=${stream}`
			);
			expect(await watching()).toEqual([{ userId: bo.id, deviceId: null, streamId: stream }]);
			await release(response);
		});

		it("refuses an entry's edits there: those stay in the entry's own space", async () => {
			const solo = await createTestNotebookEntry(harness.db, ada);
			const result = await runAndCatch(() =>
				openFeed(
					ada,
					`room=${userRoom(ada.id)}&topic=${entryTopic(solo.id)}&stream=${crypto.randomUUID()}`
				)
			);
			expect(result).toMatchObject({ type: 'error', status: 404 });
		});
	});
});

describe('POST /api/realtime/presence', () => {
	const room = () => spaceRoom(partnershipId);

	/**
	 * A device with only a notebook page open is not watching the board, so a
	 * message must still be pushed to it.
	 */
	it('does not count a notebook stream as watching the board', async () => {
		const response = await openFeed(
			ada,
			`room=${spaceRoom(partnershipId)}&topic=notebook&stream=${crypto.randomUUID()}`
		);
		expect(await watching()).toEqual([]);
		await release(response);
	});

	describe('notebook entries', () => {
		it("opens a stream on an entry the viewer may read, in the entry's room", async () => {
			const entry = await createTestNotebookEntry(harness.db, ada, { partnershipId });
			const response = await openFeed(
				bo,
				`room=${spaceRoom(partnershipId)}&topic=${entryTopic(entry.id)}&stream=${crypto.randomUUID()}`
			);
			expect(response.headers.get('content-type')).toBe('text/event-stream');
			await release(response);
		});

		it('refuses an entry hidden from the viewer, as if it did not exist', async () => {
			const entry = await createTestNotebookEntry(harness.db, ada, {
				partnershipId,
				partnerAccess: 'hidden'
			});
			const result = await runAndCatch(() =>
				openFeed(
					bo,
					`room=${spaceRoom(partnershipId)}&topic=${entryTopic(entry.id)}&stream=${crypto.randomUUID()}`
				)
			);
			expect(result).toMatchObject({ type: 'error', status: 404 });
		});

		it('refuses an entry named in a room it does not belong to', async () => {
			const solo = await createTestNotebookEntry(harness.db, ada);
			const result = await runAndCatch(() =>
				openFeed(
					ada,
					`room=${spaceRoom(partnershipId)}&topic=${entryTopic(solo.id)}&stream=${crypto.randomUUID()}`
				)
			);
			expect(result).toMatchObject({ type: 'error', status: 404 });
		});

		it("opens a stream on the viewer's own entry in their solo space's room", async () => {
			const solo = await createTestNotebookEntry(harness.db, ada);
			const response = await openFeed(
				ada,
				`room=${spaceRoom(await testSoloSpace(harness.db, ada.id))}&topic=${entryTopic(solo.id)}&stream=${crypto.randomUUID()}`
			);
			expect(response.headers.get('content-type')).toBe('text/event-stream');
			await release(response);
		});
	});

	it('refuses an unsigned visitor', async () => {
		const result = await runAndCatch(() =>
			presence(null, { room: room(), stream: crypto.randomUUID(), present: true })
		);
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});

	it.each([
		['no JSON at all', undefined],
		['a stream id that is not one', { room: 'space:x', stream: 'not-a-uuid', present: true }],
		['no stream id', { room: 'space:x', present: false }],
		['no room', { stream: '00000000-0000-4000-8000-000000000000', present: false }]
	])('refuses a body that is not `{ room, stream, present }`: %s', async (_case, json) => {
		const result = await runAndCatch(() => presence(ada, json));
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	it('404s someone outside the partnership', async () => {
		const result = await runAndCatch(() =>
			presence(stranger, { room: room(), stream: crypto.randomUUID(), present: false })
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	/**
	 * The bug this exists for: a phone that left the board went on counting as
	 * watching it, so it was never pushed to.
	 */
	it('takes a stream out of the watchers when its page says goodbye', async () => {
		const stream = crypto.randomUUID();
		await openFeed(ada, boardQuery(`stream=${stream}&device=${crypto.randomUUID()}`));

		const response = await presence(ada, { room: room(), stream, present: false });

		expect(response.status).toBe(204);
		expect(await watching()).toEqual([]);
	});

	it('lets nobody else end a stream, even knowing its id', async () => {
		const stream = crypto.randomUUID();
		const response = await openFeed(ada, boardQuery(`stream=${stream}`));

		await presence(bo, { room: room(), stream, present: false });

		expect(await watching()).toEqual([{ userId: ada.id, deviceId: null, streamId: stream }]);
		await release(response);
	});
});
