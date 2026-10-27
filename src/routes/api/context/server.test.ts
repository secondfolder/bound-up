import { afterEach, beforeEach, expect, test } from 'vitest';
import { CONTEXT_COOKIE } from '$lib/context';
import { soloSpaceFor } from '$lib/server/spaces';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestPartnership, createTestUser, type TestUser } from '$lib/testing/fixtures';
import { POST } from './+server';

/** Switching the context: a cookie for any space the viewer is in, and nothing else. */

let harness: TestDb;
let ada: TestUser;
let bo: TestUser;
let cy: TestUser;
let partnershipId: string;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	bo = await createTestUser(harness.db, { name: 'Bo' });
	cy = await createTestUser(harness.db, { name: 'Cy' });
	partnershipId = (await createTestPartnership(harness.db, ada, bo)).id;
});

afterEach(() => harness.close());

function post(user: TestUser | null, json: unknown, cookies: Record<string, string> = {}) {
	return fakeEvent<Parameters<typeof POST>[0]>({ db: harness.db, user, json, cookies });
}

test('remembers a space the viewer is in', async () => {
	const cookies: Record<string, string> = {};
	const response = await POST(post(ada, { context: partnershipId }, cookies));
	expect(response.status).toBe(204);
	expect(cookies[CONTEXT_COOKIE]).toBe(partnershipId);
});

test('remembers the viewer’s own space, and Everyone', async () => {
	const solo = defined(await soloSpaceFor(harness.db, ada.id), 'Ada’s own space');
	const cookies: Record<string, string> = {};
	await POST(post(ada, { context: solo }, cookies));
	expect(cookies[CONTEXT_COOKIE]).toBe(solo);
	await POST(post(ada, { context: 'all' }, cookies));
	expect(cookies[CONTEXT_COOKIE]).toBe('all');
});

test('404s a space the viewer is not in, and sets nothing', async () => {
	const cookies: Record<string, string> = {};
	const result = await runAndCatch(() => POST(post(cy, { context: partnershipId }, cookies)));
	expect(result).toMatchObject({ type: 'error', status: 404 });
	expect(cookies).toEqual({});
});

test.each([{}, { context: 'self' }, { context: 3 }, null])(
	'400s %j, which is not a context',
	async (body) => {
		const result = await runAndCatch(() => POST(post(ada, body)));
		expect(result).toMatchObject({ type: 'error', status: 400 });
	}
);

test('401s without a session', async () => {
	const result = await runAndCatch(() => POST(post(null, { context: 'all' })));
	expect(result).toMatchObject({ type: 'error', status: 401 });
});
