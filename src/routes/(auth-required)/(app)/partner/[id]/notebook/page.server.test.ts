import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestNotebookEntry,
	createTestPartnership,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readNotebookEntryRow,
	type TestUser
} from '$lib/testing/fixtures';
import { createTestMediaStore, type TestMediaStore } from '$lib/testing/media';
import { actions, load } from './+page.server';

const media = vi.hoisted(() => ({ store: undefined as TestMediaStore | undefined }));
vi.mock('$lib/server/media/backend', () => ({
	createMediaStore: () => Promise.resolve(media.store)
}));

/** A partnership's notebook list: who sees it, and creating an entry in it. */

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

function at(user: TestUser, formData?: Record<string, string>) {
	return fakeEvent({
		db: harness.db,
		user,
		params: { id: partnershipId },
		path: `/partner/${partnershipId}/notebook`,
		...(formData ? { formData } : {})
	});
}

function newEntry(
	vaultId: string,
	overrides: Partial<{ kind: string; entryDate: string | null }> = {}
) {
	const id = crypto.randomUUID();
	return {
		id,
		entry: JSON.stringify({
			id,
			kind: 'journal',
			entryDate: '2026-10-22',
			header: { vaultId, ciphertext: fakeSealed('header'), payloadVersion: 1 },
			firstUpdate: {
				id: crypto.randomUUID(),
				vaultId,
				ciphertext: fakeSealed('first'),
				payloadVersion: 1
			},
			...overrides
		})
	};
}

describe('load', () => {
	it('lists what both partners may see, and nothing hidden from the viewer', async () => {
		const shared = await createTestNotebookEntry(harness.db, ada, { partnershipId });
		await createTestNotebookEntry(harness.db, ada, { partnershipId, partnerAccess: 'hidden' });

		const data = await runLoad(load(at(bo)));

		expect(data.notes.map((entry: { id: string }) => entry.id)).toEqual([shared.id]);
		expect(data.room).toBe(`partnership:${partnershipId}`);
	});

	it('404s someone outside the partnership', async () => {
		const result = await runAndCatch(() => runLoad(load(at(stranger))));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});

describe('create', () => {
	it('creates a sealed entry and opens it', async () => {
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const { id, entry } = newEntry(vaultId);

		const result = await runAndCatch(() => runAction(actions, 'create', at(bo, { entry })));

		expect(result).toMatchObject({
			type: 'redirect',
			location: `/partner/${partnershipId}/notebook/${id}`
		});
		expect(await readNotebookEntryRow(harness.db, id)).toMatchObject({
			partnershipId,
			createdByUserId: bo.id,
			kind: 'journal',
			entryDate: '2026-10-22'
		});
	});

	it('refuses a journal entry without a date', async () => {
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const { entry } = newEntry(vaultId, { entryDate: null });
		const result = await runAction(actions, 'create', at(bo, { entry }));
		expect(result).toMatchObject({ status: 400 });
	});

	it("refuses an entry sealed to the viewer's own vault rather than the partnership's", async () => {
		await ensureTestPartnershipVault(harness.db, partnershipId);
		const own = await ensureTestSelfVault(harness.db, bo.id);
		const { entry } = newEntry(own);
		const result = await runAction(actions, 'create', at(bo, { entry }));
		expect(result).toMatchObject({ status: 400 });
	});

	it('404s someone outside the partnership', async () => {
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const { entry } = newEntry(vaultId);
		const result = await runAndCatch(() => runAction(actions, 'create', at(stranger, { entry })));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});
