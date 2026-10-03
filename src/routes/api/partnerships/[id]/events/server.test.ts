import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNotifier } from '$lib/server/realtime/backend';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestPartnership, createTestUser, type TestUser } from '$lib/testing/fixtures';
import { GET } from './+server';
import { POST } from './presence/+server';

/**
 * The live feed and its presence endpoint, over the in-process notifier.
 *
 * The lease rules themselves are covered per backend in
 * `server/realtime/*.test.ts`; this is about what the endpoints let through.
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
	return GET(
		fakeEvent({
			db: harness.db,
			user,
			params: { id: partnershipId },
			path: `/api/partnerships/${partnershipId}/events?${query}`
		})
	);
}

function presence(user: TestUser | null, json: unknown) {
	return POST(fakeEvent({ db: harness.db, user, params: { id: partnershipId }, json }));
}

async function watching() {
	const notifier = await createNotifier({});
	return await notifier.publish(partnershipId, { kind: 'thread' });
}

describe('GET /api/partnerships/[id]/events', () => {
	it('refuses a stream without an id, since its lease could never be renewed', async () => {
		const result = await runAndCatch(() => openFeed(ada, ''));
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	it('opens a stream that counts as its device watching', async () => {
		const stream = crypto.randomUUID();
		const device = crypto.randomUUID();
		const response = await openFeed(ada, `stream=${stream}&device=${device}`);

		expect(await watching()).toEqual([{ userId: ada.id, deviceId: device, streamId: stream }]);
		await defined(response.body, 'the stream body').cancel();
	});
});

describe('POST /api/partnerships/[id]/events/presence', () => {
	it('refuses an unsigned visitor', async () => {
		const result = await runAndCatch(() =>
			presence(null, { stream: crypto.randomUUID(), present: true })
		);
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});

	it.each([
		['no JSON at all', undefined],
		['a stream id that is not one', { stream: 'not-a-uuid', present: true }],
		['no stream id', { present: false }]
	])('refuses a body that is not `{ stream, present }`: %s', async (_case, json) => {
		const result = await runAndCatch(() => presence(ada, json));
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	it('404s someone outside the partnership', async () => {
		const result = await runAndCatch(() =>
			presence(stranger, { stream: crypto.randomUUID(), present: false })
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	/**
	 * The bug this exists for: a phone that left the board went on counting as
	 * watching it, so it was never pushed to.
	 */
	it('takes a stream out of the watchers when its page says goodbye', async () => {
		const stream = crypto.randomUUID();
		await openFeed(ada, `stream=${stream}&device=${crypto.randomUUID()}`);

		const response = await presence(ada, { stream, present: false });

		expect(response.status).toBe(204);
		expect(await watching()).toEqual([]);
	});

	it('lets nobody else end a stream, even knowing its id', async () => {
		const stream = crypto.randomUUID();
		const response = await openFeed(ada, `stream=${stream}`);

		await presence(bo, { stream, present: false });

		expect(await watching()).toEqual([{ userId: ada.id, deviceId: null, streamId: stream }]);
		await defined(response.body, 'the stream body').cancel();
	});
});
