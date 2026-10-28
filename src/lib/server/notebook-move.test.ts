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
	setTestPartnershipControl,
	type TestUser
} from '../testing/fixtures';
import { createTestMediaStore, type TestMediaStore } from '../testing/media';
import type { Db } from './db';
import { notebookEntryPrefix, notebookSnapshotKey } from './media';
import {
	appendUpdate,
	createVersion,
	getEntryContext,
	type MovedVersion,
	mayMoveEntry,
	moveEntry,
	type NotebookScope,
	resolveScope,
	stageMovedVersion
} from './notebook';

/**
 * Moving an entry to another space (docs/notebook.md, "Moving an entry"):
 * what the rows and the store look like afterwards, who may, and what
 * happens to an edit that races it. Every ciphertext is a stand-in: the
 * device re-seals, and the server only checks envelopes.
 */

let harness: TestDb;
let db: Db;
let store: TestMediaStore;
let ada: TestUser;
let bo: TestUser;
let partnershipId: string;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	store = createTestMediaStore();
	ada = await createTestUser(db, { name: 'Ada' });
	bo = await createTestUser(db, { name: 'Bo' });
	partnershipId = (await createTestPartnership(db, ada, bo)).id;
	await ensureTestPartnershipVault(db, partnershipId);
	await ensureTestSelfVault(db, ada.id);
	await ensureTestSelfVault(db, bo.id);
});

afterEach(() => harness.close());

async function context(entryId: string, user: TestUser) {
	return defined(await getEntryContext(db, entryId, user.id), 'an entry the user may read');
}

async function scope(user: TestUser, notebook: NotebookScope) {
	return defined(await resolveScope(db, notebook, user.id), 'a scope the user is in');
}

const sealed = (vaultId: string, label = 'sealed') => ({
	vaultId,
	ciphertext: fakeSealed(label),
	payloadVersion: 1
});

async function cutVersion(entryId: string, user: TestUser, upToSeq: number) {
	const entry = await context(entryId, user);
	const result = await createVersion(db, store, entry, user.id, {
		id: crypto.randomUUID(),
		upToSeq,
		snapshot: sealed(entry.entry.vaultId, 'snapshot'),
		restoredFromVersionId: null
	});
	if (!result.ok) {
		throw new Error(`could not cut a version: ${result.reason}`);
	}
}

async function addEdit(entryId: string, user: TestUser): Promise<number> {
	const entry = await context(entryId, user);
	const result = await appendUpdate(db, entry, user.id, {
		id: crypto.randomUUID(),
		...sealed(entry.entry.vaultId, 'edit')
	});
	if (!result.ok) {
		throw new Error(`could not add an edit: ${result.reason}`);
	}
	return result.seq;
}

/**
 * Does what the mover's device does: stages every version re-sealed for the
 * target, and a head version when there are edits after the newest, then
 * commits. `before` runs between the staging and the commit, for a race.
 */
async function move(
	entryId: string,
	user: TestUser,
	to: NotebookScope,
	before: () => Promise<unknown> = async () => undefined
) {
	const entry = await context(entryId, user);
	const target = await scope(user, to);
	const vaultId = defined(target.vaultId, 'the target vault');
	const versions = await readNotebookVersionRows(db, entryId);
	const updates = await readNotebookUpdateRows(db, entryId);
	const newest = Math.max(0, ...versions.map((version) => version.upToSeq));
	const upToSeq = Math.max(newest, ...updates.map((update) => update.seq));
	const stage = async (id: string): Promise<MovedVersion> => {
		const snapshot = sealed(vaultId, `moved ${id}`);
		const staged = await stageMovedVersion(db, store, entry, user.id, target, { id, snapshot });
		if (!staged.ok) {
			throw new Error(`could not stage a version: ${staged.reason}`);
		}
		return { id, payloadVersion: 1, size: snapshot.ciphertext.length };
	};
	const moved: MovedVersion[] = [];
	for (const version of versions) {
		moved.push(await stage(version.id));
	}
	const head = upToSeq > newest ? await stage(crypto.randomUUID()) : null;
	await before();
	return {
		target,
		result: await moveEntry(db, store, entry, user.id, target, {
			revision: entry.entry.revision,
			upToSeq,
			header: sealed(vaultId, 'header'),
			versions: moved,
			head
		})
	};
}

function keysUnder(prefix: string) {
	return [...store.objects.keys()].filter((key) => key.startsWith(prefix));
}

describe('moving an entry', () => {
	it('takes a solo entry into a shared space, every version and edit with it', async () => {
		const entry = await createTestNotebookEntry(db, ada);
		await cutVersion(entry.id, ada, entry.firstSeq);
		const second = await addEdit(entry.id, ada);
		await cutVersion(entry.id, ada, second);
		await addEdit(entry.id, ada);
		const before = defined(await readNotebookEntryRow(db, entry.id), 'the entry');
		const oldPrefix = notebookEntryPrefix(before);
		const oldVersions = await readNotebookVersionRows(db, entry.id);

		const { result, target } = await move(entry.id, ada, { kind: 'partnership', partnershipId });

		expect(result).toEqual({ ok: true, purgeFailed: false });
		const row = defined(await readNotebookEntryRow(db, entry.id), 'the entry');
		expect(row).toMatchObject({
			ownerId: null,
			partnershipId,
			spaceId: partnershipId,
			vaultId: target.vaultId,
			partnerAccess: 'edit',
			revision: before.revision + 1
		});
		// The two versions it had, re-sealed, and a head over the edit after them.
		const versions = await readNotebookVersionRows(db, entry.id);
		expect(versions).toHaveLength(3);
		expect(versions.every((version) => version.vaultId === target.vaultId)).toBe(true);
		expect(versions.map((version) => version.id)).toEqual(
			expect.arrayContaining(oldVersions.map((version) => version.id))
		);
		// Every edit is in the head snapshot now, so none is left under the old vault.
		expect(await readNotebookUpdateRows(db, entry.id)).toEqual([]);
		// The snapshots live under the partnership now, and nothing is left behind.
		expect(keysUnder(oldPrefix)).toEqual([]);
		const byKey = (a: string, b: string) => a.localeCompare(b);
		expect(keysUnder(notebookEntryPrefix(row)).sort(byKey)).toEqual(
			versions.map((version) => notebookSnapshotKey(row, version.id)).sort(byKey)
		);

		// Bo can read it, and write to it, under the partnership's vault.
		const asBo = await context(entry.id, bo);
		expect(asBo.access).toBe('edit');
		await addEdit(entry.id, bo);
	});

	it('takes a shared entry into the mover’s own space, out of the partner’s reach', async () => {
		await setTestPartnershipControl(db, partnershipId, 'inviter');
		const entry = await createTestNotebookEntry(db, ada, {
			partnershipId,
			partnerAccess: 'read'
		});
		const selfVault = await ensureTestSelfVault(db, ada.id);

		const { result } = await move(entry.id, ada, { kind: 'self' });

		expect(result).toMatchObject({ ok: true });
		expect(await readNotebookEntryRow(db, entry.id)).toMatchObject({
			ownerId: ada.id,
			partnershipId: null,
			vaultId: selfVault,
			partnerAccess: 'edit',
			accessSetByUserId: null
		});
		expect(await getEntryContext(db, entry.id, bo.id)).toBeNull();
		expect((await context(entry.id, ada)).access).toBe('edit');
	});

	it('needs no head when nothing was written since the newest version', async () => {
		const entry = await createTestNotebookEntry(db, ada);
		await cutVersion(entry.id, ada, entry.firstSeq);

		const { result } = await move(entry.id, ada, { kind: 'partnership', partnershipId });

		expect(result).toMatchObject({ ok: true });
		expect(await readNotebookVersionRows(db, entry.id)).toHaveLength(1);
	});

	it('is refused to a partner without the say over a shared entry', async () => {
		await setTestPartnershipControl(db, partnershipId, 'inviter');
		const entry = await createTestNotebookEntry(db, ada, { partnershipId });
		expect(mayMoveEntry(await context(entry.id, bo), bo.id)).toBe(false);
		expect(mayMoveEntry(await context(entry.id, ada), ada.id)).toBe(true);

		const target = await scope(bo, { kind: 'self' });
		const result = await moveEntry(db, store, await context(entry.id, bo), bo.id, target, {
			revision: 0,
			upToSeq: entry.firstSeq,
			header: sealed(defined(target.vaultId, 'vault')),
			versions: [],
			head: null
		});
		expect(result).toEqual({ ok: false, reason: 'read-only' });
		expect(await readNotebookEntryRow(db, entry.id)).toMatchObject({ partnershipId });
	});

	it('is refused into the space it is already in, and under the wrong vault', async () => {
		const entry = await createTestNotebookEntry(db, ada);
		const here = await scope(ada, { kind: 'self' });
		const there = await scope(ada, { kind: 'partnership', partnershipId });
		const asAda = await context(entry.id, ada);

		expect(
			await stageMovedVersion(db, store, asAda, ada.id, here, {
				id: crypto.randomUUID(),
				snapshot: sealed(entry.vaultId)
			})
		).toEqual({ ok: false, reason: 'same-space' });
		expect(
			await stageMovedVersion(db, store, asAda, ada.id, there, {
				id: crypto.randomUUID(),
				snapshot: sealed(entry.vaultId)
			})
		).toEqual({ ok: false, reason: 'wrong-vault' });
		expect(store.objects.size).toBe(0);
	});

	it('is stale when a version it was not given exists, and changes nothing', async () => {
		const entry = await createTestNotebookEntry(db, ada);
		const { result } = await move(entry.id, ada, { kind: 'partnership', partnershipId }, () =>
			cutVersion(entry.id, ada, entry.firstSeq)
		);
		expect(result).toEqual({ ok: false, reason: 'stale' });
		expect(await readNotebookEntryRow(db, entry.id)).toMatchObject({
			ownerId: ada.id,
			vaultId: entry.vaultId
		});
		// What it staged under the partnership went, and nothing else did.
		expect(keysUnder(`permanent/${partnershipId}/`)).toEqual([]);
	});

	it('is stale when an edit lands while it is staging, and keeps the edit', async () => {
		const entry = await createTestNotebookEntry(db, ada);
		const { result } = await move(entry.id, ada, { kind: 'partnership', partnershipId }, () =>
			addEdit(entry.id, ada)
		);
		expect(result).toEqual({ ok: false, reason: 'stale' });
		expect(await readNotebookUpdateRows(db, entry.id)).toHaveLength(2);
		expect(await readNotebookEntryRow(db, entry.id)).toMatchObject({ vaultId: entry.vaultId });
	});

	it('leaves an edit sealed for the old vault nowhere to land once it has moved', async () => {
		const entry = await createTestNotebookEntry(db, ada);
		// Read before the move, as a request already under way would have.
		const before = await context(entry.id, ada);
		const { result } = await move(entry.id, ada, { kind: 'partnership', partnershipId });
		expect(result).toMatchObject({ ok: true });

		const late = await appendUpdate(db, before, ada.id, {
			id: crypto.randomUUID(),
			...sealed(entry.vaultId, 'late')
		});
		expect(late).toEqual({ ok: false, reason: 'wrong-vault' });
		expect(await readNotebookUpdateRows(db, entry.id)).toEqual([]);
	});

	it('refuses a staged id that is another entry’s version', async () => {
		const first = await createTestNotebookEntry(db, ada);
		await cutVersion(first.id, ada, first.firstSeq);
		const [theirs] = await readNotebookVersionRows(db, first.id);
		const second = await createTestNotebookEntry(db, ada);
		const target = await scope(ada, { kind: 'partnership', partnershipId });

		expect(
			await stageMovedVersion(db, store, await context(second.id, ada), ada.id, target, {
				id: defined(theirs, 'a version').id,
				snapshot: sealed(defined(target.vaultId, 'vault'))
			})
		).toEqual({ ok: false, reason: 'exists' });
	});
});
