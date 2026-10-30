import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import {
	createTestUser,
	ensureTestSelfVault,
	fakeSealed,
	type TestUser
} from '$lib/testing/fixtures';
import type { Db } from './db';
import { dreams, dreamTurns } from './db/schema';
import {
	appendDreamTurn,
	createDream,
	deleteDream,
	getDream,
	getDreamPreferences,
	listDreams,
	readDreamBranch,
	saveDreamNote,
	saveDreamPreferences,
	setActiveDreamTurn,
	updateDreamSetup
} from './dreams';
import { deleteSpaceStatements } from './spaces';

/** The new engine's storage (docs/dreams.md, "Storage"). */

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

async function newDream(userId = ada.id): Promise<string> {
	const id = crypto.randomUUID();
	const result = await createDream(db, userId, id, await sealed(userId, 'setup'));
	if (!result.ok) {
		throw new Error(`fixture: the dream was refused (${result.reason})`);
	}
	return id;
}

async function append(
	dreamId: string,
	parentId: string | null,
	options: { role?: 'user' | 'model'; at?: Date; userId?: string } = {}
): Promise<string> {
	const id = crypto.randomUUID();
	const userId = options.userId ?? ada.id;
	const result = await appendDreamTurn(
		db,
		userId,
		dreamId,
		{ id, parentId, role: options.role ?? 'model', content: await sealed(userId) },
		options.at
	);
	if (!result.ok) {
		throw new Error(`fixture: the turn was refused (${result.reason})`);
	}
	return id;
}

describe('daydreams', () => {
	it('creates one under the browser’s id, and refuses the id twice', async () => {
		const id = await newDream();
		expect(await createDream(db, ada.id, id, await sealed(ada.id))).toEqual({
			ok: false,
			reason: 'id-taken'
		});
		expect((await listDreams(db, ada.id)).map((item) => item.id)).toEqual([id]);
		expect(await listDreams(db, jun.id)).toEqual([]);
	});

	it('refuses a setup sealed under someone else’s vault, or malformed', async () => {
		expect(await createDream(db, ada.id, crypto.randomUUID(), await sealed(jun.id))).toEqual({
			ok: false,
			reason: 'wrong-vault'
		});
		const bad = { ...(await sealed(ada.id)), ciphertext: 'plain text' };
		expect(await createDream(db, ada.id, crypto.randomUUID(), bad)).toEqual({
			ok: false,
			reason: 'bad-content'
		});
	});

	it('saves the setup compare-and-swap, and someone else’s reads as not found', async () => {
		const id = await newDream();
		const first = await updateDreamSetup(db, ada.id, id, {
			setup: await sealed(ada.id),
			expectedRevision: 0
		});
		expect(first).toEqual({ ok: true, revision: 1 });
		expect(
			await updateDreamSetup(db, ada.id, id, { setup: await sealed(ada.id), expectedRevision: 0 })
		).toEqual({ ok: false, reason: 'conflict' });
		expect(
			await updateDreamSetup(db, jun.id, id, { setup: await sealed(jun.id), expectedRevision: 1 })
		).toEqual({ ok: false, reason: 'not-found' });
		expect(await getDream(db, jun.id, id)).toBeNull();
	});

	it('lists the most recently played first', async () => {
		const older = await newDream();
		const newer = await newDream();
		await append(older, null, { at: new Date(Date.now() + 60_000) });
		expect((await listDreams(db, ada.id)).map((item) => item.id)).toEqual([older, newer]);
	});

	it('counts each daydream’s passages, every branch, and none of the user’s turns', async () => {
		const id = await newDream();
		const opening = await append(id, null);
		const turn = await append(id, opening, { role: 'user' });
		await append(id, turn);
		await append(id, turn);
		const empty = await newDream();
		const listed = await listDreams(db, ada.id);
		expect(listed.find((item) => item.id === id)?.passages).toBe(3);
		expect(listed.find((item) => item.id === empty)?.passages).toBe(0);
	});

	it('deletes with everything in it, and only the owner’s', async () => {
		const id = await newDream();
		const turn = await append(id, null);
		await saveDreamNote(db, ada.id, id, {
			kind: 'detail',
			id: crypto.randomUUID(),
			turnId: turn,
			content: await sealed(ada.id)
		});
		expect(await deleteDream(db, jun.id, id)).toBe(false);
		expect(await deleteDream(db, ada.id, id)).toBe(true);
		expect(await db.select({ id: dreamTurns.id }).from(dreamTurns)).toEqual([]);
	});

	it('goes with the owner’s solo space', async () => {
		const id = await newDream();
		await append(id, null);
		const [row] = await db.select({ spaceId: dreams.spaceId }).from(dreams);
		const spaceId = defined(row?.spaceId, 'the dream’s space');
		const [first, ...rest] = deleteSpaceStatements(db, spaceId);
		await db.batch([defined(first, 'a statement'), ...rest]);
		expect(await db.select({ id: dreams.id }).from(dreams)).toEqual([]);
	});
});

describe('turns', () => {
	it('builds a tree, and the page gets the branch it is on', async () => {
		const id = await newDream();
		const opening = await append(id, null, { at: new Date(1000) });
		const input = await append(id, opening, { role: 'user', at: new Date(2000) });
		const first = await append(id, input, { at: new Date(3000) });
		const take = await append(id, input, { at: new Date(4000) });

		const dream = defined(await getDream(db, ada.id, id), 'the dream');
		expect(dream.activeTurnId).toBe(take);
		expect(dream.tree.map((node) => [node.id, node.depth])).toEqual([
			[opening, 0],
			[input, 1],
			[first, 2],
			[take, 2]
		]);
		expect(dream.path.map((turn) => turn.id)).toEqual([opening, input, take]);

		expect(await setActiveDreamTurn(db, ada.id, id, first)).toEqual({ ok: true });
		const moved = defined(await getDream(db, ada.id, id), 'the dream');
		expect(moved.path.map((turn) => turn.id)).toEqual([opening, input, first]);
	});

	it('refuses a parent from another daydream, and someone else’s daydream', async () => {
		const id = await newDream();
		const other = await newDream();
		const elsewhere = await append(other, null);
		expect(
			await appendDreamTurn(db, ada.id, id, {
				id: crypto.randomUUID(),
				parentId: elsewhere,
				role: 'model',
				content: await sealed(ada.id)
			})
		).toEqual({ ok: false, reason: 'bad-parent' });
		expect(
			await appendDreamTurn(db, jun.id, id, {
				id: crypto.randomUUID(),
				parentId: null,
				role: 'model',
				content: await sealed(jun.id)
			})
		).toEqual({ ok: false, reason: 'not-found' });
		expect(await setActiveDreamTurn(db, ada.id, id, elsewhere)).toEqual({
			ok: false,
			reason: 'bad-parent'
		});
	});

	it('cannot add the same turn twice when a save is retried', async () => {
		const id = await newDream();
		const turn = {
			id: crypto.randomUUID(),
			parentId: null,
			role: 'model' as const,
			content: await sealed(ada.id)
		};
		expect((await appendDreamTurn(db, ada.id, id, turn)).ok).toBe(true);
		expect(await appendDreamTurn(db, ada.id, id, turn)).toEqual({
			ok: false,
			reason: 'id-taken'
		});
	});
});

describe('detail and summaries', () => {
	it('come with the branch they were written on, and not with another', async () => {
		const id = await newDream();
		const opening = await append(id, null, { at: new Date(1000) });
		const a = await append(id, opening, { at: new Date(2000) });
		const b = await append(id, opening, { at: new Date(3000) });
		const onA = crypto.randomUUID();
		const onOpening = crypto.randomUUID();
		for (const [noteId, turnId, kind] of [
			[onA, a, 'detail'],
			[onOpening, opening, 'summary']
		] as const) {
			expect(
				await saveDreamNote(db, ada.id, id, {
					kind,
					id: noteId,
					turnId,
					content: await sealed(ada.id)
				})
			).toEqual({ ok: true });
		}
		const onB = defined(await getDream(db, ada.id, id), 'the dream');
		expect(onB.details).toEqual([]);
		expect(onB.summaries.map((note) => note.id)).toEqual([onOpening]);

		const branch = defined(await readDreamBranch(db, ada.id, id, a), 'branch a');
		expect(branch.path.map((turn) => turn.id)).toEqual([opening, a]);
		expect(branch.details.map((note) => note.id)).toEqual([onA]);
		expect(await readDreamBranch(db, jun.id, id, a)).toBeNull();
		expect(await readDreamBranch(db, ada.id, id, crypto.randomUUID())).toBeNull();
		expect(b).toBeDefined();
	});

	it('refuses a note on a turn of another daydream', async () => {
		const id = await newDream();
		const other = await append(await newDream(), null);
		expect(
			await saveDreamNote(db, ada.id, id, {
				kind: 'detail',
				id: crypto.randomUUID(),
				turnId: other,
				content: await sealed(ada.id)
			})
		).toEqual({ ok: false, reason: 'bad-parent' });
	});
});

describe('preferences', () => {
	it('are created once, then saved compare-and-swap', async () => {
		expect(await getDreamPreferences(db, ada.id)).toBeNull();
		const content = await sealed(ada.id);
		expect(await saveDreamPreferences(db, ada.id, { content, expectedRevision: null })).toEqual({
			ok: true,
			revision: 0
		});
		expect(await saveDreamPreferences(db, ada.id, { content, expectedRevision: null })).toEqual({
			ok: false,
			reason: 'conflict'
		});
		expect(await saveDreamPreferences(db, ada.id, { content, expectedRevision: 0 })).toEqual({
			ok: true,
			revision: 1
		});
		const stored = defined(await getDreamPreferences(db, ada.id), 'preferences');
		expect(stored.revision).toBe(1);
		expect(stored.sealed.recordId).toBe(ada.id);
		expect(
			await saveDreamPreferences(db, ada.id, {
				content: await sealed(jun.id),
				expectedRevision: 1
			})
		).toEqual({ ok: false, reason: 'wrong-vault' });
	});
});
