import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTEXT_COOKIE } from '$lib/context';
import { soloSpaceFor } from '$lib/server/spaces';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestInvite,
	createTestNotebookEntry,
	createTestPartnership,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readNotebookEntryRow,
	setTestPartnershipControl,
	type TestUser
} from '$lib/testing/fixtures';
import { createTestMediaStore, type TestMediaStore } from '$lib/testing/media';
import type { NotebookEntryView } from '$lib/types';
import { actions, load } from './+page.server';

const media = vi.hoisted(() => ({ store: undefined as TestMediaStore | undefined }));
vi.mock('$lib/server/media/backend', () => ({
	createMediaStore: () => Promise.resolve(media.store)
}));

/**
 * The notebook list in every context, and creating in it: the list follows
 * the context, and a create goes where its form says, whatever the context.
 * See docs/notebook.md and docs/contexts.md.
 */

let harness: TestDb;
let ada: TestUser;
let bo: TestUser;
let stranger: TestUser;
let partnershipId: string;
let adaSolo: string;

beforeEach(async () => {
	harness = await createTestDb();
	media.store = createTestMediaStore();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	bo = await createTestUser(harness.db, { name: 'Bo' });
	stranger = await createTestUser(harness.db, { name: 'Cy' });
	partnershipId = (await createTestPartnership(harness.db, ada, bo)).id;
	adaSolo = defined(await soloSpaceFor(harness.db, ada.id), 'Ada’s own space');
});

afterEach(() => harness.close());

function at(
	user: TestUser,
	options: {
		context?: string;
		formData?: Record<string, string>;
		cookies?: Record<string, string>;
	} = {}
) {
	return fakeEvent({
		db: harness.db,
		user,
		path: '/notebook',
		...(options.context === undefined ? {} : { contextCookie: options.context }),
		...(options.cookies ? { cookies: options.cookies } : {}),
		...(options.formData ? { formData: options.formData } : {})
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

const ids = (entries: { id: string }[]) => entries.map((entry) => entry.id);

describe('load', () => {
	it('shows only the viewer’s own notebook in Me, live on their own room', async () => {
		const own = await createTestNotebookEntry(harness.db, ada);
		await createTestNotebookEntry(harness.db, ada, { partnershipId });

		const data = await runLoad(load(at(ada, { context: adaSolo })));

		expect(ids(data.notes)).toEqual([own.id]);
		expect(data.room).toBe(`user:${ada.id}`);
		expect(data.spaceIds).toEqual([adaSolo]);
		expect(data.dependency).toBe('notebook:self');
	});

	it('shows a partnership’s notebook in its context, and nothing hidden from the viewer', async () => {
		const shared = await createTestNotebookEntry(harness.db, ada, { partnershipId });
		await createTestNotebookEntry(harness.db, ada, { partnershipId, partnerAccess: 'hidden' });
		await createTestNotebookEntry(harness.db, bo);

		const data = await runLoad(load(at(bo, { context: partnershipId })));

		expect(ids(data.notes)).toEqual([shared.id]);
		expect(data.room).toBe(`partnership:${partnershipId}`);
		expect(data.dependency).toBe(`notebook:${partnershipId}`);
	});

	it('shows every space at once in Everyone, each row saying whose, with no stream', async () => {
		const own = await createTestNotebookEntry(harness.db, ada);
		const shared = await createTestNotebookEntry(harness.db, bo, { partnershipId });

		const data = await runLoad(load(at(ada, { context: 'all' })));

		expect(new Set(ids(data.notes))).toEqual(new Set([own.id, shared.id]));
		expect(data.notes.find((entry: NotebookEntryView) => entry.id === own.id)?.spaceId).toBe(
			adaSolo
		);
		expect(data.notes.find((entry: NotebookEntryView) => entry.id === shared.id)?.spaceId).toBe(
			partnershipId
		);
		expect(data.room).toBeNull();
		expect(data.spaceIds).toEqual([adaSolo, partnershipId]);
		expect(data.dependency).toBe('notebook:all');
	});

	it('is Everyone on a device that has never switched', async () => {
		await createTestNotebookEntry(harness.db, ada);
		await createTestNotebookEntry(harness.db, ada, { partnershipId });
		expect((await runLoad(load(at(ada)))).notes).toHaveLength(2);
	});

	it('applies each row’s own access in Everyone, exactly as its own list would', async () => {
		await setTestPartnershipControl(harness.db, partnershipId, 'inviter');
		const hidden = await createTestNotebookEntry(harness.db, ada, {
			partnershipId,
			partnerAccess: 'hidden'
		});
		const readOnly = await createTestNotebookEntry(harness.db, ada, {
			partnershipId,
			partnerAccess: 'read'
		});

		const all = await runLoad(load(at(bo, { context: 'all' })));
		const single = await runLoad(load(at(bo, { context: partnershipId })));

		expect(ids(all.notes)).not.toContain(hidden.id);
		expect(all.notes.find((entry: NotebookEntryView) => entry.id === readOnly.id)?.access).toBe(
			'read'
		);
		expect(all.notes).toEqual(single.notes);
	});

	it('lists an entry the viewer may now show again, without its header, in Everyone too', async () => {
		// Hidden by Ada while she held control; control then moved to Bo.
		await setTestPartnershipControl(harness.db, partnershipId, 'inviter');
		const hidden = await createTestNotebookEntry(harness.db, ada, {
			partnershipId,
			partnerAccess: 'hidden'
		});
		await setTestPartnershipControl(harness.db, partnershipId, 'invitee');

		const data = await runLoad(load(at(bo, { context: 'all' })));
		expect(data.notes.find((entry: NotebookEntryView) => entry.id === hidden.id)).toMatchObject({
			header: null
		});
	});

	it('falls back to Everyone for a space the viewer is not in, and forgets it', async () => {
		const cookies: Record<string, string> = {};
		await createTestNotebookEntry(harness.db, stranger);
		const data = await runLoad(load(at(stranger, { context: partnershipId, cookies })));
		expect(data.spaceIds).toHaveLength(1);
		expect(data.room).toBe(`user:${stranger.id}`);
		expect(cookies[CONTEXT_COOKIE]).toBeUndefined();
	});

	it('leaves a pending invite’s space out of Everyone', async () => {
		const pending = await createTestInvite(harness.db, stranger);
		const data = await runLoad(load(at(stranger, { context: 'all' })));
		expect(data.spaceIds).not.toContain(pending.id);
	});
});

describe('create', () => {
	it('creates in the space the form names, and opens it', async () => {
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const { id, entry } = newEntry(vaultId);

		const result = await runAndCatch(() =>
			runAction(actions, 'create', at(bo, { formData: { entry, spaceId: partnershipId } }))
		);

		expect(result).toMatchObject({ type: 'redirect', location: `/notebook/${id}` });
		expect(await readNotebookEntryRow(harness.db, id)).toMatchObject({
			partnershipId,
			spaceId: partnershipId,
			createdByUserId: bo.id
		});
	});

	it('creates in the viewer’s own notebook when the form names their own space', async () => {
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const { id, entry } = newEntry(vaultId, { kind: 'note', entryDate: null });

		await runAndCatch(() =>
			runAction(actions, 'create', at(ada, { formData: { entry, spaceId: adaSolo } }))
		);

		expect(await readNotebookEntryRow(harness.db, id)).toMatchObject({
			ownerId: ada.id,
			partnershipId: null,
			spaceId: adaSolo
		});
	});

	/**
	 * Another tab switching the context must not move this tab's next write:
	 * the form's space is the only one that counts.
	 */
	it('goes where the form says, never where the context points', async () => {
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const { id, entry } = newEntry(vaultId);

		await runAndCatch(() =>
			runAction(
				actions,
				'create',
				at(ada, { context: partnershipId, formData: { entry, spaceId: adaSolo } })
			)
		);

		expect(await readNotebookEntryRow(harness.db, id)).toMatchObject({ spaceId: adaSolo });
	});

	it('404s a space the viewer is not in, and one not named at all', async () => {
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const named = newEntry(vaultId);
		const unnamed = newEntry(vaultId);
		const strangers = await runAndCatch(() =>
			runAction(
				actions,
				'create',
				at(stranger, { formData: { entry: named.entry, spaceId: partnershipId } })
			)
		);
		const missing = await runAndCatch(() =>
			runAction(
				actions,
				'create',
				at(ada, { context: partnershipId, formData: { entry: unnamed.entry } })
			)
		);
		expect(strangers).toMatchObject({ type: 'error', status: 404 });
		expect(missing).toMatchObject({ type: 'error', status: 404 });
		expect(await readNotebookEntryRow(harness.db, named.id)).toBeUndefined();
	});

	it("404s someone else's own space", async () => {
		const vaultId = await ensureTestSelfVault(harness.db, ada.id);
		const { entry } = newEntry(vaultId);
		const result = await runAndCatch(() =>
			runAction(actions, 'create', at(bo, { formData: { entry, spaceId: adaSolo } }))
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it('refuses a journal entry without a date', async () => {
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const { entry } = newEntry(vaultId, { entryDate: null });
		const result = await runAction(
			actions,
			'create',
			at(bo, { formData: { entry, spaceId: partnershipId } })
		);
		expect(result).toMatchObject({ status: 400 });
	});

	it("refuses an entry sealed to the viewer's own vault rather than the partnership's", async () => {
		await ensureTestPartnershipVault(harness.db, partnershipId);
		const own = await ensureTestSelfVault(harness.db, bo.id);
		const { entry } = newEntry(own);
		const result = await runAction(
			actions,
			'create',
			at(bo, { formData: { entry, spaceId: partnershipId } })
		);
		expect(result).toMatchObject({ status: 400 });
	});

	it('creates a scene, listed apart from notes', async () => {
		const vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
		const { id, entry } = newEntry(vaultId, { kind: 'scene', entryDate: null });
		await runAndCatch(() =>
			runAction(actions, 'create', at(ada, { formData: { entry, spaceId: partnershipId } }))
		);
		const data = await runLoad(load(at(ada, { context: partnershipId })));
		expect(ids(data.scenes)).toEqual([id]);
		expect(ids(data.notes)).not.toContain(id);
	});
});

describe('show', () => {
	it('shows a hidden entry again for the member the say has moved to', async () => {
		await setTestPartnershipControl(harness.db, partnershipId, 'inviter');
		const hidden = await createTestNotebookEntry(harness.db, ada, {
			partnershipId,
			partnerAccess: 'hidden'
		});
		await setTestPartnershipControl(harness.db, partnershipId, 'invitee');

		await runAction(
			actions,
			'show',
			at(bo, { formData: { entryId: hidden.id, spaceId: partnershipId } })
		);

		expect(await readNotebookEntryRow(harness.db, hidden.id)).toMatchObject({
			partnerAccess: 'edit',
			accessSetByUserId: null
		});
	});

	it('404s an entry named with a space it is not in', async () => {
		await setTestPartnershipControl(harness.db, partnershipId, 'inviter');
		const hidden = await createTestNotebookEntry(harness.db, ada, {
			partnershipId,
			partnerAccess: 'hidden'
		});
		await setTestPartnershipControl(harness.db, partnershipId, 'invitee');
		const boSolo = defined(await soloSpaceFor(harness.db, bo.id), 'Bo’s own space');
		const result = await runAndCatch(() =>
			runAction(actions, 'show', at(bo, { formData: { entryId: hidden.id, spaceId: boSolo } }))
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});
