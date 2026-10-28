import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entryTopic } from '$lib/notebook';
import { createNotifier } from '$lib/server/realtime/backend';
import { spaceRoom } from '$lib/server/realtime/index';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestNotebookEntry,
	createTestPartnership,
	createTestUser,
	ensureTestSelfVault,
	fakeSealed,
	readNotebookEntryRow,
	setTestPartnershipControl,
	type TestUser,
	testSoloSpace
} from '$lib/testing/fixtures';
import { createTestMediaStore, type TestMediaStore } from '$lib/testing/media';
import { POST } from './+server';
import { PUT } from './versions/[versionId]/+server';

const media = vi.hoisted(() => ({ store: undefined as TestMediaStore | undefined }));
vi.mock('$lib/server/media/backend', () => ({
	createMediaStore: () => Promise.resolve(media.store)
}));

/**
 * Moving an entry over HTTP: staging a version, committing, who is told,
 * and who may. `src/lib/server/notebook-move.test.ts` covers the rows.
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
	await setTestPartnershipControl(harness.db, partnershipId, 'inviter');
});

afterEach(() => harness.close());

function sealed(vaultId: string, label = 'sealed') {
	return { vaultId, ciphertext: fakeSealed(label), payloadVersion: 1 };
}

function stage(user: TestUser, entryId: string, versionId: string, json: unknown) {
	return PUT(fakeEvent({ db: harness.db, user, params: { entryId, versionId }, json }));
}

function commit(user: TestUser, entryId: string, json: unknown) {
	return POST(fakeEvent({ db: harness.db, user, params: { entryId }, json }));
}

/** Moves a shared entry with one stored edit and no versions into `user`'s own space. */
async function moveToSolo(user: TestUser, entryId: string, firstSeq: number) {
	const vaultId = await ensureTestSelfVault(harness.db, user.id);
	const spaceId = await testSoloSpace(harness.db, user.id);
	const head = crypto.randomUUID();
	const snapshot = sealed(vaultId, 'head');
	const staged = await stage(user, entryId, head, { spaceId, ...snapshot });
	if (staged.status !== 200) {
		throw new Error(`could not stage the head version: ${staged.status}`);
	}
	return await commit(user, entryId, {
		spaceId,
		revision: 0,
		upToSeq: firstSeq,
		header: sealed(vaultId, 'header'),
		versions: [],
		head: { id: head, payloadVersion: 1, size: snapshot.ciphertext.length }
	});
}

describe('POST /api/notebook/entries/[entryId]/move', () => {
	it('moves the entry, and tells everyone with it open, who then cannot reach it', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, { partnershipId });
		const notifier = await createNotifier({});
		const response = await notifier.stream(spaceRoom(partnershipId), {
			watcher: { userId: bo.id, deviceId: null, streamId: crypto.randomUUID() },
			topics: [entryTopic(entry.id)]
		});
		const reader = defined(response.body, 'the stream').getReader();
		await reader.read(); // the preamble

		const moved = await moveToSolo(ada, entry.id, entry.firstSeq);

		expect(moved.status).toBe(200);
		const frame = new TextDecoder().decode((await reader.read()).value);
		expect(frame).toContain('"type":"moved"');
		expect(await readNotebookEntryRow(harness.db, entry.id)).toMatchObject({
			ownerId: ada.id,
			partnershipId: null
		});
		await reader.cancel();
	});

	it('refuses a partner without the say over the entry', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, { partnershipId });
		const result = await runAndCatch(() => moveToSolo(bo, entry.id, entry.firstSeq));
		expect(result).toMatchObject({ type: 'error', status: 403 });
		expect(await readNotebookEntryRow(harness.db, entry.id)).toMatchObject({ partnershipId });
	});

	it('404s a space the mover is not in, and an entry they cannot see', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada);
		const theirs = await testSoloSpace(harness.db, stranger.id);
		const vaultId = await ensureTestSelfVault(harness.db, stranger.id);
		expect(
			await runAndCatch(() =>
				stage(ada, entry.id, crypto.randomUUID(), { spaceId: theirs, ...sealed(vaultId) })
			)
		).toMatchObject({ type: 'error', status: 404 });
		expect(
			await runAndCatch(() =>
				stage(stranger, entry.id, crypto.randomUUID(), { spaceId: theirs, ...sealed(vaultId) })
			)
		).toMatchObject({ type: 'error', status: 404 });
	});

	it('answers a commit that missed something with a 409, and moves nothing', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, { partnershipId });
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const spaceId = await testSoloSpace(harness.db, ada.id);
		// No head, though there is an edit no version covers.
		const response = await commit(ada, entry.id, {
			spaceId,
			revision: 0,
			upToSeq: entry.firstSeq,
			header: sealed(vaultId, 'header'),
			versions: [],
			head: null
		});
		expect(response.status).toBe(409);
		expect(await readNotebookEntryRow(harness.db, entry.id)).toMatchObject({ partnershipId });
	});
});
