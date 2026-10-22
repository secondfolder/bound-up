import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db';
import { defined } from '../testing/defined';
import {
	createTestNotebookEntry,
	createTestPartnership,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readNotebookEntryRow,
	readNotebookUpdateRows,
	readNotebookVersionRows,
	type TestUser
} from '../testing/fixtures';
import { createTestMediaStore, type TestMediaStore } from '../testing/media';
import type { Db } from './db';
import { notebookEntries, partnerships } from './db/schema';
import { notebookEntryPrefix } from './media';
import {
	appendUpdate,
	createEntry,
	createVersion,
	deleteEntry,
	getEntryContext,
	getHomeNotebookWidget,
	getPartnershipNotebookWidget,
	liftHiddenEntry,
	listEntries,
	listUpdatesAfter,
	listVersions,
	readVersionSnapshot,
	resolveScope,
	saveHeader,
	setPartnerAccess
} from './notebook';

/**
 * The notebook's database half: what it stores, what it refuses, and who it
 * lets near what. The content of an entry is never in reach of these tests,
 * because the server never has it: every ciphertext here is a stand-in.
 */

let harness: TestDb;
let db: Db;
let store: TestMediaStore;
let ada: TestUser;
let bo: TestUser;
let stranger: TestUser;
let partnershipId: string;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	store = createTestMediaStore();
	ada = await createTestUser(db, { name: 'Ada' });
	bo = await createTestUser(db, { name: 'Bo' });
	stranger = await createTestUser(db, { name: 'Cy' });
	partnershipId = (await createTestPartnership(db, ada, bo)).id;
});

afterEach(() => harness.close());

async function context(entryId: string, user: TestUser) {
	return defined(await getEntryContext(db, entryId, user.id), 'an entry the user may read');
}

function sealedUpdate(vaultId: string, label = 'update') {
	return { id: crypto.randomUUID(), vaultId, ciphertext: fakeSealed(label), payloadVersion: 1 };
}

describe('createEntry', () => {
	it('stores the entry and its first edit together, sealed, with nothing readable beside them', async () => {
		const vaultId = await ensureTestSelfVault(db, ada.id);
		const resolved = defined(await resolveScope(db, { kind: 'self' }, ada.id), 'the scope');
		const id = crypto.randomUUID();
		const header = { vaultId, ciphertext: fakeSealed('header'), payloadVersion: 1 };
		const firstUpdate = sealedUpdate(vaultId, 'first');

		const result = await createEntry(db, resolved, ada.id, {
			id,
			kind: 'journal',
			entryDate: '2026-10-22',
			header,
			firstUpdate
		});

		expect(result).toMatchObject({ ok: true });
		const row = defined(await readNotebookEntryRow(db, id), 'the entry');
		expect(row).toMatchObject({
			ownerId: ada.id,
			partnershipId: null,
			kind: 'journal',
			entryDate: '2026-10-22',
			ciphertext: header.ciphertext,
			vaultId
		});
		// Nothing a person wrote has anywhere to be: the only text columns that
		// are not ids, dates or settings are ciphertexts.
		expect(Object.keys(row)).not.toContain('title');
		expect(Object.keys(row)).not.toContain('body');
		const updates = await readNotebookUpdateRows(db, id);
		expect(updates.map((update) => update.ciphertext)).toEqual([firstUpdate.ciphertext]);
	});

	it('refuses a ciphertext that is not a sealed record', async () => {
		const vaultId = await ensureTestSelfVault(db, ada.id);
		const resolved = defined(await resolveScope(db, { kind: 'self' }, ada.id), 'the scope');
		const result = await createEntry(db, resolved, ada.id, {
			id: crypto.randomUUID(),
			kind: 'note',
			entryDate: null,
			header: { vaultId, ciphertext: 'my secret title', payloadVersion: 1 },
			firstUpdate: sealedUpdate(vaultId)
		});
		expect(result).toEqual({ ok: false, reason: 'bad-content' });
	});

	it('refuses a record sealed to the wrong vault for its scope', async () => {
		const ownVault = await ensureTestSelfVault(db, ada.id);
		await ensureTestPartnershipVault(db, partnershipId);
		const resolved = defined(
			await resolveScope(db, { kind: 'partnership', partnershipId }, ada.id),
			'the scope'
		);
		const result = await createEntry(db, resolved, ada.id, {
			id: crypto.randomUUID(),
			kind: 'note',
			entryDate: null,
			header: { vaultId: ownVault, ciphertext: fakeSealed(), payloadVersion: 1 },
			firstUpdate: sealedUpdate(ownVault)
		});
		expect(result).toEqual({ ok: false, reason: 'wrong-vault' });
	});

	it('gives nobody outside a partnership its scope', async () => {
		expect(await resolveScope(db, { kind: 'partnership', partnershipId }, stranger.id)).toBeNull();
	});
});

describe('getEntryContext', () => {
	it('treats an entry hidden from the viewer exactly like one that does not exist', async () => {
		const hidden = await createTestNotebookEntry(db, ada, {
			partnershipId,
			partnerAccess: 'hidden'
		});
		expect(await getEntryContext(db, hidden.id, bo.id)).toBeNull();
		expect(await getEntryContext(db, crypto.randomUUID(), bo.id)).toBeNull();
		expect(await getEntryContext(db, hidden.id, ada.id)).not.toBeNull();
	});

	it('refuses an entry reached through the wrong scope', async () => {
		const solo = await createTestNotebookEntry(db, ada);
		expect(
			await getEntryContext(db, solo.id, ada.id, { kind: 'partnership', partnershipId })
		).toBeNull();
		expect(await getEntryContext(db, solo.id, ada.id, { kind: 'self' })).not.toBeNull();
	});

	it("never lets anyone into somebody else's solo entry", async () => {
		const solo = await createTestNotebookEntry(db, ada);
		expect(await getEntryContext(db, solo.id, bo.id)).toBeNull();
	});
});

describe('appendUpdate', () => {
	it('stores edits in order and hands them back after a seq', async () => {
		const entry = await createTestNotebookEntry(db, ada, { partnershipId });
		const first = await appendUpdate(
			db,
			await context(entry.id, bo),
			bo.id,
			sealedUpdate(entry.vaultId)
		);
		const second = await appendUpdate(
			db,
			await context(entry.id, ada),
			ada.id,
			sealedUpdate(entry.vaultId)
		);
		const firstSeq = first.ok ? first.seq : -1;
		const secondSeq = second.ok ? second.seq : -1;
		expect(secondSeq).toBeGreaterThan(firstSeq);

		const after = await listUpdatesAfter(db, entry.id, firstSeq);
		expect(after.updates.map((update) => update.seq)).toEqual([secondSeq]);
		expect(after.more).toBe(false);
	});

	it('stores a resent batch once, and says which seq it already has', async () => {
		const entry = await createTestNotebookEntry(db, ada);
		const update = sealedUpdate(entry.vaultId);
		const first = await appendUpdate(db, await context(entry.id, ada), ada.id, update);
		const again = await appendUpdate(db, await context(entry.id, ada), ada.id, update);
		expect(again).toEqual({ ok: true, seq: first.ok ? first.seq : -1, duplicate: true });
		expect(await readNotebookUpdateRows(db, entry.id)).toHaveLength(2);
	});

	it('refuses an edit from a partner who may only read', async () => {
		const entry = await createTestNotebookEntry(db, ada, { partnershipId, partnerAccess: 'read' });
		const result = await appendUpdate(
			db,
			await context(entry.id, bo),
			bo.id,
			sealedUpdate(entry.vaultId)
		);
		expect(result).toEqual({ ok: false, reason: 'read-only' });
	});

	it('refuses an edit sealed to another vault', async () => {
		const entry = await createTestNotebookEntry(db, ada);
		const otherVault = await ensureTestPartnershipVault(db, partnershipId);
		const result = await appendUpdate(
			db,
			await context(entry.id, ada),
			ada.id,
			sealedUpdate(otherVault)
		);
		expect(result).toEqual({ ok: false, reason: 'wrong-vault' });
	});

	it('records who edited last, without rewriting the entry on every batch', async () => {
		const entry = await createTestNotebookEntry(db, ada, { partnershipId });
		await appendUpdate(db, await context(entry.id, bo), bo.id, sealedUpdate(entry.vaultId));
		const afterBo = defined(await readNotebookEntryRow(db, entry.id), 'the entry');
		expect(afterBo.lastEditedByUserId).toBe(bo.id);

		await appendUpdate(db, await context(entry.id, bo), bo.id, sealedUpdate(entry.vaultId));
		const again = defined(await readNotebookEntryRow(db, entry.id), 'the entry');
		expect(again.lastEditedAt).toEqual(afterBo.lastEditedAt);
	});
});

describe('saveHeader', () => {
	it('is compare-and-swap, and says the current revision when it loses', async () => {
		const entry = await createTestNotebookEntry(db, ada);
		const header = { vaultId: entry.vaultId, ciphertext: fakeSealed('title'), payloadVersion: 1 };
		const saved = await saveHeader(db, await context(entry.id, ada), header, 0);
		expect(saved).toEqual({ ok: true, revision: 1 });

		const stale = await saveHeader(db, await context(entry.id, ada), header, 0);
		expect(stale).toEqual({ ok: false, reason: 'conflict', revision: 1 });
	});

	it('refuses a reader', async () => {
		const entry = await createTestNotebookEntry(db, ada, { partnershipId, partnerAccess: 'read' });
		const result = await saveHeader(
			db,
			await context(entry.id, bo),
			{ vaultId: entry.vaultId, ciphertext: fakeSealed(), payloadVersion: 1 },
			0
		);
		expect(result).toEqual({ ok: false, reason: 'read-only' });
	});
});

describe('versions', () => {
	async function version(entryId: string, user: TestUser, upToSeq: number, vaultId: string) {
		return await createVersion(db, store, await context(entryId, user), user.id, {
			id: crypto.randomUUID(),
			upToSeq,
			snapshot: { vaultId, ciphertext: fakeSealed('snapshot'), payloadVersion: 1 },
			restoredFromVersionId: null
		});
	}

	async function edit(entryId: string, user: TestUser, vaultId: string): Promise<number> {
		const result = await appendUpdate(
			db,
			await context(entryId, user),
			user.id,
			sealedUpdate(vaultId)
		);
		return result.ok ? result.seq : -1;
	}

	it('keeps the snapshot in the media store and lists who wrote what it covers', async () => {
		const entry = await createTestNotebookEntry(db, ada, { partnershipId });
		const seq = await edit(entry.id, bo, entry.vaultId);

		expect(await version(entry.id, ada, seq, entry.vaultId)).toEqual({ ok: true, compacted: 0 });

		const [listed] = await listVersions(db, entry.id);
		expect(listed?.contributorUserIds.sort()).toEqual([ada.id, bo.id].sort());
		const row = defined(await readNotebookEntryRow(db, entry.id), 'the entry');
		const ciphertext = await readVersionSnapshot(store, row, defined(listed, 'the version').id);
		expect(ciphertext).toMatch(/^sb1\./);
		// Under the partnership's own prefix, so disconnecting takes it.
		expect([...store.objects.keys()][0]).toMatch(new RegExp(`^permanent/${partnershipId}/`));
	});

	it('refuses a version that covers nothing new, or more than is stored', async () => {
		const entry = await createTestNotebookEntry(db, ada);
		const seq = await edit(entry.id, ada, entry.vaultId);
		expect(await version(entry.id, ada, seq, entry.vaultId)).toMatchObject({ ok: true });
		expect(await version(entry.id, ada, seq, entry.vaultId)).toEqual({
			ok: false,
			reason: 'stale'
		});
		expect(await version(entry.id, ada, seq + 1000, entry.vaultId)).toEqual({
			ok: false,
			reason: 'stale'
		});
		// The loser's upload is not left behind.
		expect(store.objects.size).toBe(1);
	});

	/** One version's margin: the edits after the previous version always survive. */
	it('deletes only the edits that two versions now cover', async () => {
		const entry = await createTestNotebookEntry(db, ada);
		const first = await edit(entry.id, ada, entry.vaultId);
		await version(entry.id, ada, first, entry.vaultId);
		expect(await readNotebookUpdateRows(db, entry.id)).toHaveLength(2);

		const second = await edit(entry.id, ada, entry.vaultId);
		const result = await version(entry.id, ada, second, entry.vaultId);

		expect(result).toEqual({ ok: true, compacted: 2 });
		const left = await readNotebookUpdateRows(db, entry.id);
		expect(left.map((update) => update.seq)).toEqual([second]);
		expect(await readNotebookVersionRows(db, entry.id)).toHaveLength(2);
	});

	it('refuses a reader', async () => {
		const entry = await createTestNotebookEntry(db, ada, { partnershipId, partnerAccess: 'read' });
		expect(await version(entry.id, bo, entry.firstSeq, entry.vaultId)).toEqual({
			ok: false,
			reason: 'read-only'
		});
	});
});

describe('access', () => {
	it('lets the member holding control restrict the other, and re-reads control to do it', async () => {
		await db
			.update(partnerships)
			.set({ control: 'inviter' })
			.where(eq(partnerships.id, partnershipId));
		const entry = await createTestNotebookEntry(db, ada, { partnershipId });
		expect(await setPartnerAccess(db, await context(entry.id, ada), ada.id, 'hidden')).toEqual({
			ok: true
		});
		expect(await getEntryContext(db, entry.id, bo.id)).toBeNull();

		// Bo does not hold control: the inviter does.
		const other = await createTestNotebookEntry(db, bo, { partnershipId });
		expect(await setPartnerAccess(db, await context(other.id, bo), bo.id, 'hidden')).toEqual({
			ok: false,
			reason: 'not-found'
		});
	});

	it('lets a member lift a restriction once control has moved to them from its setter', async () => {
		await db
			.update(partnerships)
			.set({ control: 'inviter' })
			.where(eq(partnerships.id, partnershipId));
		const entry = await createTestNotebookEntry(db, ada, {
			partnershipId,
			partnerAccess: 'hidden'
		});
		expect(await liftHiddenEntry(db, entry.id, bo.id, partnershipId)).toEqual({
			ok: false,
			reason: 'not-found'
		});

		await db
			.update(partnerships)
			.set({ control: 'invitee' })
			.where(eq(partnerships.id, partnershipId));

		expect(await liftHiddenEntry(db, entry.id, bo.id, partnershipId)).toEqual({ ok: true });
		expect((await context(entry.id, bo)).access).toBe('edit');
	});

	it('lists a hidden entry, without its header, only to someone who may now show it', async () => {
		await db
			.update(partnerships)
			.set({ control: 'inviter' })
			.where(eq(partnerships.id, partnershipId));
		const entry = await createTestNotebookEntry(db, ada, {
			partnershipId,
			partnerAccess: 'hidden'
		});
		const scope = { kind: 'partnership', partnershipId } as const;
		const asBo = async () =>
			await listEntries(db, defined(await resolveScope(db, scope, bo.id), 'scope'), bo.id, 'note');
		expect(await asBo()).toEqual([]);

		await db
			.update(partnerships)
			.set({ control: 'invitee' })
			.where(eq(partnerships.id, partnershipId));

		expect(await asBo()).toEqual([expect.objectContaining({ id: entry.id, header: null })]);
	});
});

describe('listEntries', () => {
	it('orders a journal by date, newest first, and notes by when they were last edited', async () => {
		const older = await createTestNotebookEntry(db, ada, {
			kind: 'journal',
			entryDate: '2026-10-01'
		});
		const newer = await createTestNotebookEntry(db, ada, {
			kind: 'journal',
			entryDate: '2026-10-20'
		});
		const firstNote = await createTestNotebookEntry(db, ada);
		const secondNote = await createTestNotebookEntry(db, ada);
		await db
			.update(notebookEntries)
			.set({ lastEditedAt: new Date(Date.now() + 60_000) })
			.where(eq(notebookEntries.id, firstNote.id));

		const resolved = defined(await resolveScope(db, { kind: 'self' }, ada.id), 'the scope');
		const journal = await listEntries(db, resolved, ada.id, 'journal');
		const notes = await listEntries(db, resolved, ada.id, 'note');

		expect(journal.map((entry) => entry.id)).toEqual([newer.id, older.id]);
		expect(notes.map((entry) => entry.id)).toEqual([firstNote.id, secondNote.id]);
	});
});

describe('the cards', () => {
	it('show your own notebook on /home and the shared one on the partner page, minus what is hidden', async () => {
		await createTestNotebookEntry(db, ada);
		const shared = await createTestNotebookEntry(db, ada, { partnershipId });
		await createTestNotebookEntry(db, ada, { partnershipId, partnerAccess: 'hidden' });

		expect(await getHomeNotebookWidget(db, ada.id)).toHaveLength(1);
		expect(await getHomeNotebookWidget(db, bo.id)).toEqual([]);
		const bosCard = defined(await getPartnershipNotebookWidget(db, partnershipId, bo.id), 'card');
		expect(bosCard.map((item) => item.id)).toEqual([shared.id]);
		expect(await getPartnershipNotebookWidget(db, partnershipId, stranger.id)).toBeNull();
	});
});

describe('deleteEntry', () => {
	it('takes the edits, the versions and their snapshots with it', async () => {
		const entry = await createTestNotebookEntry(db, ada);
		await createVersion(db, store, await context(entry.id, ada), ada.id, {
			id: crypto.randomUUID(),
			upToSeq: entry.firstSeq,
			snapshot: { vaultId: entry.vaultId, ciphertext: fakeSealed(), payloadVersion: 1 },
			restoredFromVersionId: null
		});
		const row = defined(await readNotebookEntryRow(db, entry.id), 'the entry');

		expect(await deleteEntry(db, store, await context(entry.id, ada))).toEqual({
			ok: true,
			purgeFailed: false
		});

		expect(await readNotebookEntryRow(db, entry.id)).toBeUndefined();
		expect(await readNotebookUpdateRows(db, entry.id)).toEqual([]);
		expect(
			[...store.objects.keys()].filter((key) => key.startsWith(notebookEntryPrefix(row)))
		).toEqual([]);
	});

	it('refuses a reader', async () => {
		const entry = await createTestNotebookEntry(db, ada, { partnershipId, partnerAccess: 'read' });
		expect(await deleteEntry(db, store, await context(entry.id, bo))).toEqual({
			ok: false,
			reason: 'read-only'
		});
	});
});
