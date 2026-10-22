import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entryTopic } from '$lib/notebook';
import { createNotifier } from '$lib/server/realtime/backend';
import { partnershipRoom } from '$lib/server/realtime/index';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestNotebookEntry,
	createTestPartnership,
	createTestUser,
	fakeSealed,
	readNotebookUpdateRows,
	type TestUser
} from '$lib/testing/fixtures';
import { createTestMediaStore, type TestMediaStore } from '$lib/testing/media';
import { GET, POST } from './+server';

const media = vi.hoisted(() => ({ store: undefined as TestMediaStore | undefined }));
vi.mock('$lib/server/media/backend', () => ({
	createMediaStore: () => Promise.resolve(media.store)
}));

/**
 * An entry's edits over HTTP: who may post one, what is stored, and what the
 * room relays. Every ciphertext is a stand-in: the server never opens one.
 */

let harness: TestDb;
let ada: TestUser;
let bo: TestUser;
let stranger: TestUser;
let partnershipId: string;

beforeEach(async () => {
	harness = await createTestDb();
	media.store = createTestMediaStore();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	bo = await createTestUser(harness.db, { name: 'Bo' });
	stranger = await createTestUser(harness.db, { name: 'Cy' });
	partnershipId = (await createTestPartnership(harness.db, ada, bo)).id;
});

afterEach(() => harness.close());

function post(user: TestUser, entryId: string, json: unknown) {
	return POST(fakeEvent({ db: harness.db, user, params: { entryId }, json }));
}

function get(user: TestUser, entryId: string, query: string) {
	return GET(
		fakeEvent({
			db: harness.db,
			user,
			params: { entryId },
			path: `/api/notebook/entries/${entryId}/updates?${query}`
		})
	);
}

function sealed(vaultId: string, label = 'edit') {
	return { id: crypto.randomUUID(), vaultId, ciphertext: fakeSealed(label), payloadVersion: 1 };
}

/** Opens a stream on the entry's topic, as a page would, and returns its next frame. */
async function listen(entryId: string, user: TestUser) {
	const notifier = await createNotifier({});
	const response = await notifier.stream(partnershipRoom(partnershipId), {
		watcher: { userId: user.id, deviceId: null, streamId: crypto.randomUUID() },
		topics: [entryTopic(entryId)]
	});
	const reader = defined(response.body, 'the stream').getReader();
	await reader.read(); // the preamble
	return {
		next: async () => new TextDecoder().decode((await reader.read()).value),
		release: () => reader.cancel()
	};
}

describe('POST /api/notebook/entries/[entryId]/updates', () => {
	it('stores an edit and relays it, sealed, to everyone with the entry open', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, { partnershipId });
		const watching = await listen(entry.id, bo);
		const update = sealed(entry.vaultId);
		const origin = crypto.randomUUID();

		const response = await post(ada, entry.id, { origin, update });

		const { seq } = (await response.json()) as { seq: number };
		const [event, data] = (await watching.next()).trim().split('\n');
		expect(event).toBe(`event: ${entryTopic(entry.id)}`);
		expect(JSON.parse(defined(data, 'the frame').slice('data: '.length))).toEqual({
			type: 'update',
			origin,
			seq,
			...update
		});
		expect((await readNotebookUpdateRows(harness.db, entry.id)).at(-1)?.ciphertext).toBe(
			update.ciphertext
		);
		await watching.release();
	});

	it('refuses an edit from a partner who may only read, by the stored row', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, {
			partnershipId,
			partnerAccess: 'read'
		});
		const result = await runAndCatch(() =>
			post(bo, entry.id, { origin: crypto.randomUUID(), update: sealed(entry.vaultId) })
		);
		expect(result).toMatchObject({ type: 'error', status: 403 });
	});

	it("relays a reader's cursor, which is never stored", async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, {
			partnershipId,
			partnerAccess: 'read'
		});
		const watching = await listen(entry.id, ada);
		const awareness = sealed(entry.vaultId, 'cursor');

		const response = await post(bo, entry.id, { origin: crypto.randomUUID(), awareness });

		expect(response.status).toBe(200);
		expect(await watching.next()).toContain('"type":"awareness"');
		expect(await readNotebookUpdateRows(harness.db, entry.id)).toHaveLength(1);
		await watching.release();
	});

	it('404s an entry hidden from the viewer, and a stranger', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, {
			partnershipId,
			partnerAccess: 'hidden'
		});
		for (const user of [bo, stranger]) {
			const result = await runAndCatch(() =>
				post(user, entry.id, { origin: crypto.randomUUID(), update: sealed(entry.vaultId) })
			);
			expect(result).toMatchObject({ type: 'error', status: 404 });
		}
	});

	it.each([
		['plaintext where a sealed record belongs', { ciphertext: 'what I wrote today' }],
		['a vault id that is not one', { vaultId: 'not-a-vault' }]
	])('refuses %s', async (_case, override) => {
		const entry = await createTestNotebookEntry(harness.db, ada);
		const result = await runAndCatch(() =>
			post(ada, entry.id, {
				origin: crypto.randomUUID(),
				update: { ...sealed(entry.vaultId), ...override }
			})
		);
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	it('does not relay a resend again', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, { partnershipId });
		const update = sealed(entry.vaultId);
		await post(ada, entry.id, { origin: crypto.randomUUID(), update });
		const watching = await listen(entry.id, bo);

		await post(ada, entry.id, { origin: crypto.randomUUID(), update });

		const pending = await Promise.race([
			watching.next().then(() => 'relayed'),
			Promise.resolve('nothing')
		]);
		expect(pending).toBe('nothing');
		await watching.release();
	});
});

describe('GET /api/notebook/entries/[entryId]/updates', () => {
	it('opens an entry from its first edit when it has no version yet', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada);
		const response = await get(ada, entry.id, 'after=0&snapshot=1');
		const body = (await response.json()) as { snapshot: unknown; updates: { seq: number }[] };
		expect(body.snapshot).toBeNull();
		expect(body.updates.map((update) => update.seq)).toEqual([entry.firstSeq]);
	});

	it('refuses a seq that is not one', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada);
		const result = await runAndCatch(() => get(ada, entry.id, 'after=-1'));
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	it('404s an entry hidden from the viewer', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, {
			partnershipId,
			partnerAccess: 'hidden'
		});
		const result = await runAndCatch(() => get(bo, entry.id, 'after=0'));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});
