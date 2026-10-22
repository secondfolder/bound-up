import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNotifier } from '$lib/server/realtime/backend';
import { partnershipRoom, userRoom } from '$lib/server/realtime/index';
import { publishMessagingEvent } from '$lib/server/realtime/messaging';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestPartnership, createTestUser, type TestUser } from '$lib/testing/fixtures';
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
	return `room=${partnershipRoom(partnershipId)}&topic=messages&${extra}`;
}

function presence(user: TestUser | null, json: unknown) {
	return POST(fakeEvent({ db: harness.db, user, json }));
}

async function watching() {
	const notifier = await createNotifier({});
	return await publishMessagingEvent(notifier, partnershipId, { kind: 'thread' });
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
		['no topic', `room=partnership:${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}`],
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

	it('refuses messages in a room that is not a partnership', async () => {
		const result = await runAndCatch(() =>
			openFeed(ada, `room=${userRoom(ada.id)}&topic=messages&stream=${crypto.randomUUID()}`)
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});

describe('POST /api/realtime/presence', () => {
	const room = () => partnershipRoom(partnershipId);

	it('refuses an unsigned visitor', async () => {
		const result = await runAndCatch(() =>
			presence(null, { room: room(), stream: crypto.randomUUID(), present: true })
		);
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});

	it.each([
		['no JSON at all', undefined],
		['a stream id that is not one', { room: 'partnership:x', stream: 'not-a-uuid', present: true }],
		['no stream id', { room: 'partnership:x', present: false }],
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
