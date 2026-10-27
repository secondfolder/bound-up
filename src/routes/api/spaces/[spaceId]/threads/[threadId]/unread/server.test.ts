import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { soloSpaceFor } from '$lib/server/spaces';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestThread,
	createTestUser,
	type TestUser
} from '$lib/testing/fixtures';
import { GET } from './+server';

/** What a thread page asks before toasting another thread's new message. */

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;
let cy: TestUser;
let partnershipId: string;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	jun = await createTestUser(harness.db, { name: 'Jun' });
	cy = await createTestUser(harness.db, { name: 'Cy' });
	partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
});

afterEach(() => harness.close());

function ask(user: TestUser | null, params: { spaceId: string; threadId: string }) {
	return GET(fakeEvent({ db: harness.db, user, params }));
}

describe('GET /api/spaces/[spaceId]/threads/[threadId]/unread', () => {
	it('says whether the thread is unread for the viewer', async () => {
		const { threadId } = await createTestThread(harness.db, partnershipId, jun);
		const forAda = await ask(ada, { spaceId: partnershipId, threadId });
		expect(await forAda.json()).toEqual({ unread: true });
		const forJun = await ask(jun, { spaceId: partnershipId, threadId });
		expect(await forJun.json()).toEqual({ unread: false });
	});

	it('refuses an unsigned visitor', async () => {
		const { threadId } = await createTestThread(harness.db, partnershipId, jun);
		const result = await runAndCatch(() => ask(null, { spaceId: partnershipId, threadId }));
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});

	/** The same re-join as every thread route: no peeking into other couples. */
	it('404s a thread outside the viewer’s partnership', async () => {
		const elsewhere = (await createTestPartnership(harness.db, cy, ada)).id;
		const { threadId } = await createTestThread(harness.db, partnershipId, jun);
		const asStranger = await runAndCatch(() => ask(cy, { spaceId: partnershipId, threadId }));
		expect(asStranger).toMatchObject({ type: 'error', status: 404 });
		const wrongPartnership = await runAndCatch(() => ask(ada, { spaceId: elsewhere, threadId }));
		expect(wrongPartnership).toMatchObject({ type: 'error', status: 404 });
	});

	/** A space is checked by membership, and a solo space holds no messages. */
	it('404s the viewer’s own solo space', async () => {
		const { threadId } = await createTestThread(harness.db, partnershipId, jun);
		const solo = defined(await soloSpaceFor(harness.db, ada.id), 'solo space');
		const result = await runAndCatch(() => ask(ada, { spaceId: solo, threadId }));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});
