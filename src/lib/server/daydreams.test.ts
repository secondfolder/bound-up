import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import {
	appendTestTurn,
	createTestDaydream,
	createTestPartnership,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readDaydreamRow,
	readDaydreamTurnRows,
	type TestUser
} from '$lib/testing/fixtures';
import {
	acceptDisclosure,
	appendTurn,
	createDaydream,
	createLibraryItem,
	createMark,
	deleteDaydream,
	deleteLibraryItem,
	deleteMark,
	getDaydream,
	getLibrary,
	hasAcceptedDisclosure,
	type LibraryKind,
	listDaydreams,
	listLibrary,
	readTurns,
	setActiveTurn,
	updateDaydreamSetup,
	updateLibraryItem
} from './daydreams';
import type { Db } from './db';
import { daydreams } from './db/schema';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
});

afterEach(() => harness.close());

async function sealed(userId: string, label = 'x') {
	return {
		vaultId: await ensureTestSelfVault(db, userId),
		ciphertext: fakeSealed(label),
		payloadVersion: 1
	};
}

/** Appends straight through `appendTurn`, for the cases the fixture would throw on. */
async function append(
	userId: string,
	daydreamId: string,
	parentId: string | null,
	options: { id?: string; role?: 'user' | 'story'; at?: Date; sealedBy?: string } = {}
) {
	return await appendTurn(
		db,
		userId,
		daydreamId,
		{
			id: options.id ?? crypto.randomUUID(),
			parentId,
			role: options.role ?? 'story',
			content: await sealed(options.sealedBy ?? userId)
		},
		options.at
	);
}

describe('the disclosure', () => {
	it('is not accepted until it is, and accepting twice keeps the first time', async () => {
		expect(await hasAcceptedDisclosure(db, ada.id)).toBe(false);
		await acceptDisclosure(db, ada.id, new Date('2026-01-01T00:00:00Z'));
		await acceptDisclosure(db, ada.id, new Date('2026-06-01T00:00:00Z'));
		expect(await hasAcceptedDisclosure(db, ada.id)).toBe(true);
		const row = await db.query.daydreamPreferences.findFirst();
		expect(row?.disclosureAcceptedAt).toEqual(new Date('2026-01-01T00:00:00Z'));
		// Per account.
		expect(await hasAcceptedDisclosure(db, jun.id)).toBe(false);
	});
});

describe('createDaydream', () => {
	it('stores the sealed setup under the id the browser chose', async () => {
		const id = crypto.randomUUID();
		const setup = await sealed(ada.id, 'setup');
		expect(await createDaydream(db, ada.id, id, setup)).toEqual({ ok: true });
		expect(await readDaydreamRow(db, id)).toMatchObject({
			ownerId: ada.id,
			ciphertext: setup.ciphertext,
			vaultId: setup.vaultId,
			revision: 0,
			lastTurnAt: null
		});
	});

	it('refuses an id that is taken, so a retried create cannot make two', async () => {
		const id = crypto.randomUUID();
		await createDaydream(db, ada.id, id, await sealed(ada.id));
		expect(await createDaydream(db, ada.id, id, await sealed(ada.id))).toEqual({
			ok: false,
			reason: 'id-taken'
		});
	});

	it("refuses a setup sealed anywhere but the user's own vault", async () => {
		const partnership = await createTestPartnership(db, ada, jun);
		const vaultId = await ensureTestPartnershipVault(db, partnership.id);
		const result = await createDaydream(db, ada.id, crypto.randomUUID(), {
			vaultId,
			ciphertext: fakeSealed(),
			payloadVersion: 1
		});
		expect(result).toEqual({ ok: false, reason: 'wrong-vault' });
		const juns = await createDaydream(db, ada.id, crypto.randomUUID(), await sealed(jun.id));
		expect(juns).toEqual({ ok: false, reason: 'wrong-vault' });
	});

	it('refuses something that is not a sealed record, or a version it does not know', async () => {
		const setup = await sealed(ada.id);
		expect(
			await createDaydream(db, ada.id, crypto.randomUUID(), { ...setup, ciphertext: 'plain words' })
		).toEqual({ ok: false, reason: 'bad-content' });
		expect(
			await createDaydream(db, ada.id, crypto.randomUUID(), { ...setup, payloadVersion: 99 })
		).toEqual({ ok: false, reason: 'bad-content' });
	});
});

describe('updateDaydreamSetup', () => {
	it('replaces the setup at the revision it was opened at, and moves the revision on', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const setup = await sealed(ada.id, 'edited');
		expect(await updateDaydreamSetup(db, ada.id, id, { setup, expectedRevision: 0 })).toEqual({
			ok: true
		});
		expect(await readDaydreamRow(db, id)).toMatchObject({
			ciphertext: setup.ciphertext,
			revision: 1
		});
	});

	it('refuses a stale revision rather than overwriting a newer edit', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		await updateDaydreamSetup(db, ada.id, id, { setup: await sealed(ada.id), expectedRevision: 0 });
		expect(
			await updateDaydreamSetup(db, ada.id, id, {
				setup: await sealed(ada.id),
				expectedRevision: 0
			})
		).toEqual({ ok: false, reason: 'conflict' });
	});

	it("reads someone else's daydream as not there", async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(
			await updateDaydreamSetup(db, jun.id, id, {
				setup: await sealed(jun.id),
				expectedRevision: 0
			})
		).toEqual({ ok: false, reason: 'not-found' });
	});
});

describe('appendTurn', () => {
	it('adds a root, then each turn one deeper than its parent, and moves the user to it', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const rootId = crypto.randomUUID();
		const at = new Date('2026-03-01T12:00:00Z');
		expect(await append(ada.id, id, null, { id: rootId, at })).toEqual({ ok: true, position: 0 });
		const childId = crypto.randomUUID();
		expect(await append(ada.id, id, rootId, { id: childId, role: 'user' })).toEqual({
			ok: true,
			position: 1
		});
		const rows = await readDaydreamTurnRows(db, id);
		expect(rows.map((row) => [row.id, row.parentId, row.role, row.position])).toEqual([
			[rootId, null, 'story', 0],
			[childId, rootId, 'user', 1]
		]);
		expect(await readDaydreamRow(db, id)).toMatchObject({ activeTurnId: childId });
		expect((await readDaydreamRow(db, id))?.lastTurnAt).not.toBeNull();
	});

	it('keeps two turns after the same one as two branches, never a conflict', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story', 'user']);
		const parent = defined(turnIds[1], 'parent');
		const first = await append(ada.id, id, parent);
		const second = await append(ada.id, id, parent);
		expect(first).toEqual({ ok: true, position: 2 });
		expect(second).toEqual({ ok: true, position: 2 });
		const siblings = (await readDaydreamTurnRows(db, id)).filter((row) => row.parentId === parent);
		expect(siblings).toHaveLength(2);
	});

	it('allows a second root: a retried opening', async () => {
		const { id } = await createTestDaydream(db, ada.id, ['story']);
		expect(await append(ada.id, id, null)).toEqual({ ok: true, position: 0 });
	});

	it('refuses a parent that is not one of this daydream’s turns', async () => {
		const other = await createTestDaydream(db, ada.id, ['story']);
		const { id } = await createTestDaydream(db, ada.id);
		expect(await append(ada.id, id, defined(other.turnIds[0], 'other turn'))).toEqual({
			ok: false,
			reason: 'bad-parent'
		});
		expect(await append(ada.id, id, crypto.randomUUID())).toEqual({
			ok: false,
			reason: 'bad-parent'
		});
	});

	it('refuses a turn id that is taken, so a retried save cannot add it twice', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story']);
		const result = await append(ada.id, id, null, {
			id: defined(turnIds[0], 'turn'),
			role: 'user'
		});
		expect(result).toEqual({ ok: false, reason: 'id-taken' });
		expect(await readDaydreamTurnRows(db, id)).toHaveLength(1);
	});

	it("refuses a turn in someone else's daydream", async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await append(jun.id, id, null)).toEqual({ ok: false, reason: 'not-found' });
	});

	it("refuses a turn sealed in a vault that is not the owner's", async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await append(ada.id, id, null, { sealedBy: jun.id })).toEqual({
			ok: false,
			reason: 'wrong-vault'
		});
	});
});

describe('moving between branches', () => {
	it('moves the user to any of the daydream’s turns, and no one else’s', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story', 'user', 'story']);
		const first = defined(turnIds[0], 'first');
		expect(await setActiveTurn(db, ada.id, id, first)).toEqual({ ok: true });
		expect(await readDaydreamRow(db, id)).toMatchObject({ activeTurnId: first });

		const other = await createTestDaydream(db, ada.id, ['story']);
		expect(await setActiveTurn(db, ada.id, id, defined(other.turnIds[0], 'other'))).toEqual({
			ok: false,
			reason: 'bad-parent'
		});
		expect(await setActiveTurn(db, jun.id, id, first)).toEqual({ ok: false, reason: 'not-found' });
	});

	it('opens turns by id, only from the owner’s own daydream', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story', 'user']);
		const other = await createTestDaydream(db, ada.id, ['story']);
		const opened = defined(
			await readTurns(db, ada.id, id, [...turnIds, defined(other.turnIds[0], 'other')]),
			'turns'
		);
		expect(opened.map((turn) => turn.id).sort()).toEqual([...turnIds].sort());
		expect(opened[0]?.sealed.recordId).toBe(opened[0]?.id);
		expect(await readTurns(db, jun.id, id, turnIds)).toBeNull();
	});
});

describe('reading', () => {
	it('lists only the owner’s daydreams, most recently played first', async () => {
		const older = await createTestDaydream(db, ada.id, ['story']);
		const fresh = await createTestDaydream(db, ada.id);
		const newer = await createTestDaydream(db, ada.id, ['story']);
		await createTestDaydream(db, jun.id);

		const ids = (await listDaydreams(db, ada.id)).map((daydream) => daydream.id);
		expect(ids).toHaveLength(3);
		// Played ones by when they were played (the fixtures' clock moves on),
		// and an unplayed one by when it was made — which is now, after both.
		expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
		expect(ids).toContain(fresh.id);
	});

	it('loads the whole tree’s shape, and the branch being read with its content', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story', 'user', 'story']);
		const [opening, said, reply] = turnIds;
		// A retried reply beside the last one, then back to the first take.
		const retry = await appendTestTurn(db, ada.id, id, defined(said, 'said'));
		await setActiveTurn(db, ada.id, id, defined(reply, 'reply'));

		const daydream = defined(await getDaydream(db, ada.id, id), 'daydream');
		expect(daydream.activeTurnId).toBe(reply);
		expect(daydream.tree.map((node) => node.id)).toEqual([...turnIds, retry]);
		expect(daydream.tree.find((node) => node.id === retry)).toMatchObject({
			parentId: said,
			position: 2
		});
		expect(daydream.path.map((turn) => turn.id)).toEqual([opening, said, reply]);
		expect(daydream.path[0]?.sealed.recordId).toBe(opening);
		expect(daydream.setup.recordId).toBe(id);
	});

	it('falls back to the newest leaf when the active turn is not set', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story', 'user']);
		const retry = await appendTestTurn(db, ada.id, id, defined(turnIds[0], 'opening'), 'user');
		await db.update(daydreams).set({ activeTurnId: null });
		const daydream = defined(await getDaydream(db, ada.id, id), 'daydream');
		expect(daydream.activeTurnId).toBe(retry);
		expect(daydream.path.map((turn) => turn.id)).toEqual([turnIds[0], retry]);
	});

	it('loads a branch longer than one query can ask for', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id);
		let parent: string | null = null;
		for (let index = 0; index < 130; index += 1) {
			parent = await appendTestTurn(db, ada.id, id, parent, index % 2 ? 'user' : 'story');
			turnIds.push(parent);
		}
		const daydream = defined(await getDaydream(db, ada.id, id), 'daydream');
		expect(daydream.path.map((turn) => turn.id)).toEqual(turnIds);
	});

	it('is empty and has no active turn before the opening', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await getDaydream(db, ada.id, id)).toMatchObject({
			activeTurnId: null,
			tree: [],
			path: [],
			marks: []
		});
	});

	it("does not load someone else's daydream", async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await getDaydream(db, jun.id, id)).toBeNull();
	});
});

describe('marks', () => {
	it('adds a bookmark or reaction to one of the daydream’s turns, and lists it', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story']);
		const turnId = defined(turnIds[0], 'turn');
		const markId = crypto.randomUUID();
		expect(
			await createMark(db, ada.id, id, { id: markId, turnId, content: await sealed(ada.id) })
		).toEqual({
			ok: true
		});
		const daydream = defined(await getDaydream(db, ada.id, id), 'daydream');
		expect(daydream.marks).toEqual([
			expect.objectContaining({
				id: markId,
				turnId,
				sealed: expect.objectContaining({ recordId: markId })
			})
		]);
	});

	it('refuses a turn that is not this daydream’s, a taken id, and someone else’s daydream', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story']);
		const other = await createTestDaydream(db, ada.id, ['story']);
		const turnId = defined(turnIds[0], 'turn');
		expect(
			await createMark(db, ada.id, id, {
				id: crypto.randomUUID(),
				turnId: defined(other.turnIds[0], 'other'),
				content: await sealed(ada.id)
			})
		).toEqual({ ok: false, reason: 'bad-parent' });
		const markId = crypto.randomUUID();
		await createMark(db, ada.id, id, { id: markId, turnId, content: await sealed(ada.id) });
		expect(
			await createMark(db, ada.id, id, { id: markId, turnId, content: await sealed(ada.id) })
		).toEqual({
			ok: false,
			reason: 'id-taken'
		});
		expect(
			await createMark(db, jun.id, id, {
				id: crypto.randomUUID(),
				turnId,
				content: await sealed(jun.id)
			})
		).toEqual({ ok: false, reason: 'not-found' });
	});

	it('deletes a mark, only the owner’s', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story']);
		const markId = crypto.randomUUID();
		await createMark(db, ada.id, id, {
			id: markId,
			turnId: defined(turnIds[0], 'turn'),
			content: await sealed(ada.id)
		});
		expect(await deleteMark(db, jun.id, id, markId)).toBe(false);
		expect(await deleteMark(db, ada.id, id, markId)).toBe(true);
		expect(await deleteMark(db, ada.id, id, markId)).toBe(false);
	});
});

describe('the libraries', () => {
	describe.each(['characters', 'ideas'] as const satisfies readonly LibraryKind[])('%s', (kind) => {
		it('adds, lists, edits at a revision, and deletes', async () => {
			const itemId = crypto.randomUUID();
			expect(
				await createLibraryItem(db, ada.id, kind, { id: itemId, content: await sealed(ada.id) })
			).toEqual({
				ok: true,
				revision: 0
			});
			expect((await listLibrary(db, ada.id, kind)).map((item) => item.id)).toEqual([itemId]);
			expect(
				await updateLibraryItem(db, ada.id, kind, itemId, {
					content: await sealed(ada.id, 'edited'),
					expectedRevision: 0
				})
			).toEqual({ ok: true, revision: 1 });
			expect(
				await updateLibraryItem(db, ada.id, kind, itemId, {
					content: await sealed(ada.id),
					expectedRevision: 0
				})
			).toEqual({ ok: false, reason: 'conflict' });
			expect((await listLibrary(db, ada.id, kind))[0]).toMatchObject({ revision: 1 });
			expect(await deleteLibraryItem(db, ada.id, kind, itemId)).toBe(true);
			expect(await listLibrary(db, ada.id, kind)).toEqual([]);
		});

		it('is the owner’s alone', async () => {
			const itemId = crypto.randomUUID();
			await createLibraryItem(db, ada.id, kind, { id: itemId, content: await sealed(ada.id) });
			expect(await listLibrary(db, jun.id, kind)).toEqual([]);
			expect(
				await updateLibraryItem(db, jun.id, kind, itemId, {
					content: await sealed(jun.id),
					expectedRevision: 0
				})
			).toEqual({ ok: false, reason: 'not-found' });
			expect(await deleteLibraryItem(db, jun.id, kind, itemId)).toBe(false);
			expect(
				await createLibraryItem(db, ada.id, kind, {
					id: crypto.randomUUID(),
					content: await sealed(jun.id)
				})
			).toEqual({ ok: false, reason: 'wrong-vault' });
		});
	});

	it('keeps the two libraries apart, and a deletion leaves daydreams alone', async () => {
		const itemId = crypto.randomUUID();
		await createLibraryItem(db, ada.id, 'characters', {
			id: itemId,
			content: await sealed(ada.id)
		});
		const { id } = await createTestDaydream(db, ada.id, ['story']);
		expect(await getLibrary(db, ada.id)).toMatchObject({
			characters: [expect.objectContaining({ id: itemId })],
			ideas: []
		});
		await deleteLibraryItem(db, ada.id, 'characters', itemId);
		expect(await getDaydream(db, ada.id, id)).not.toBeNull();
	});
});

describe('deleteDaydream', () => {
	it('deletes the daydream and every turn and mark of it', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story', 'user']);
		await createMark(db, ada.id, id, {
			id: crypto.randomUUID(),
			turnId: defined(turnIds[0], 'turn'),
			content: await sealed(ada.id)
		});
		expect(await deleteDaydream(db, ada.id, id)).toBe(true);
		expect(await readDaydreamRow(db, id)).toBeUndefined();
		expect(await readDaydreamTurnRows(db, id)).toEqual([]);
		expect(await db.query.daydreamMarks.findMany()).toEqual([]);
	});

	it("does not delete someone else's", async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await deleteDaydream(db, jun.id, id)).toBe(false);
		expect(await readDaydreamRow(db, id)).toBeDefined();
	});
});
