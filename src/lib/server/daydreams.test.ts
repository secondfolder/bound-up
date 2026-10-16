import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import {
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
	deleteDaydream,
	getDaydream,
	getDaydreamsWidget,
	hasAcceptedDisclosure,
	listDaydreams,
	replaceLatestCharacterTurn,
	updateDaydreamSetup
} from './daydreams';
import type { Db } from './db';

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
	it('adds turns at the next position, and marks when the daydream was last played', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const at = new Date('2026-03-01T12:00:00Z');
		const first = await appendTurn(
			db,
			ada.id,
			id,
			{ id: crypto.randomUUID(), role: 'character', content: await sealed(ada.id) },
			at
		);
		const second = await appendTurn(db, ada.id, id, {
			id: crypto.randomUUID(),
			role: 'user',
			content: await sealed(ada.id)
		});
		expect(first).toMatchObject({ ok: true, position: 0, revision: 0 });
		expect(second).toMatchObject({ ok: true, position: 1 });
		expect((await readDaydreamTurnRows(db, id)).map((row) => row.role)).toEqual([
			'character',
			'user'
		]);
		expect((await readDaydreamRow(db, id))?.lastTurnAt).not.toBeNull();
	});

	it('numbers each daydream on its own', async () => {
		const a = await createTestDaydream(db, ada.id, ['character']);
		const b = await createTestDaydream(db, ada.id);
		const result = await appendTurn(db, ada.id, b.id, {
			id: crypto.randomUUID(),
			role: 'character',
			content: await sealed(ada.id)
		});
		expect(result).toMatchObject({ ok: true, position: 0 });
		expect(await readDaydreamTurnRows(db, a.id)).toHaveLength(1);
	});

	it('refuses a turn id that is taken, so a retried save cannot add it twice', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['character']);
		const result = await appendTurn(db, ada.id, id, {
			id: defined(turnIds[0], 'turn'),
			role: 'user',
			content: await sealed(ada.id)
		});
		expect(result).toEqual({ ok: false, reason: 'id-taken' });
		expect(await readDaydreamTurnRows(db, id)).toHaveLength(1);
	});

	it("refuses a turn in someone else's daydream", async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const result = await appendTurn(db, jun.id, id, {
			id: crypto.randomUUID(),
			role: 'user',
			content: await sealed(jun.id)
		});
		expect(result).toEqual({ ok: false, reason: 'not-found' });
	});

	it("refuses a turn sealed in a vault that is not the owner's", async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const result = await appendTurn(db, ada.id, id, {
			id: crypto.randomUUID(),
			role: 'user',
			content: await sealed(jun.id)
		});
		expect(result).toEqual({ ok: false, reason: 'wrong-vault' });
	});
});

describe('replaceLatestCharacterTurn', () => {
	it('replaces the newest turn when it is the character’s', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, [
			'character',
			'user',
			'character'
		]);
		const content = await sealed(ada.id, 'retried');
		const result = await replaceLatestCharacterTurn(db, ada.id, id, {
			turnId: defined(turnIds[2], 'latest'),
			expectedRevision: 0,
			content
		});
		expect(result).toEqual({ ok: true, revision: 1 });
		const rows = await readDaydreamTurnRows(db, id);
		expect(rows[2]).toMatchObject({ ciphertext: content.ciphertext, revision: 1, position: 2 });
	});

	it('refuses any turn but the newest', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, [
			'character',
			'user',
			'character'
		]);
		const result = await replaceLatestCharacterTurn(db, ada.id, id, {
			turnId: defined(turnIds[0], 'opening'),
			expectedRevision: 0,
			content: await sealed(ada.id)
		});
		expect(result).toEqual({ ok: false, reason: 'not-latest' });
	});

	it('refuses to rewrite what the user said, even when it is the newest', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['character', 'user']);
		const result = await replaceLatestCharacterTurn(db, ada.id, id, {
			turnId: defined(turnIds[1], 'user turn'),
			expectedRevision: 0,
			content: await sealed(ada.id)
		});
		expect(result).toEqual({ ok: false, reason: 'not-latest' });
	});

	it('refuses a stale revision, so two devices retrying cannot both land', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['character']);
		const turnId = defined(turnIds[0], 'turn');
		await replaceLatestCharacterTurn(db, ada.id, id, {
			turnId,
			expectedRevision: 0,
			content: await sealed(ada.id)
		});
		const second = await replaceLatestCharacterTurn(db, ada.id, id, {
			turnId,
			expectedRevision: 0,
			content: await sealed(ada.id)
		});
		expect(second).toEqual({ ok: false, reason: 'conflict' });
	});

	it("reads someone else's daydream as not there", async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['character']);
		const result = await replaceLatestCharacterTurn(db, jun.id, id, {
			turnId: defined(turnIds[0], 'turn'),
			expectedRevision: 0,
			content: await sealed(jun.id)
		});
		expect(result).toEqual({ ok: false, reason: 'not-found' });
	});
});

describe('reading', () => {
	it('lists only the owner’s daydreams, most recently played first', async () => {
		const older = await createTestDaydream(db, ada.id, ['character']);
		const fresh = await createTestDaydream(db, ada.id);
		const newer = await createTestDaydream(db, ada.id, ['character']);
		await createTestDaydream(db, jun.id);

		const ids = (await listDaydreams(db, ada.id)).map((daydream) => daydream.id);
		expect(ids).toHaveLength(3);
		// Played ones by when they were played (the fixtures' clock moves on),
		// and an unplayed one by when it was made — which is now, after both.
		expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
		expect(ids).toContain(fresh.id);
	});

	it('previews the top of the list on the widget, with the full count', async () => {
		for (let index = 0; index < 4; index += 1) {
			await createTestDaydream(db, ada.id);
		}
		const widget = await getDaydreamsWidget(db, ada.id, 3);
		expect(widget.daydreams).toHaveLength(3);
		expect(widget.total).toBe(4);
	});

	it('loads a daydream with its turns, oldest first', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, [
			'character',
			'user',
			'character'
		]);
		const daydream = defined(await getDaydream(db, ada.id, id), 'daydream');
		expect(daydream.turns.map((turn) => turn.id)).toEqual(turnIds);
		expect(daydream.turns.map((turn) => turn.position)).toEqual([0, 1, 2]);
		expect(daydream.setup.recordId).toBe(id);
		expect(daydream.turns[0]?.sealed.recordId).toBe(turnIds[0]);
	});

	it("does not load someone else's daydream", async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await getDaydream(db, jun.id, id)).toBeNull();
	});
});

describe('deleteDaydream', () => {
	it('deletes the daydream and every turn of it', async () => {
		const { id } = await createTestDaydream(db, ada.id, ['character', 'user']);
		expect(await deleteDaydream(db, ada.id, id)).toBe(true);
		expect(await readDaydreamRow(db, id)).toBeUndefined();
		expect(await readDaydreamTurnRows(db, id)).toEqual([]);
	});

	it("does not delete someone else's", async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await deleteDaydream(db, jun.id, id)).toBe(false);
		expect(await readDaydreamRow(db, id)).toBeDefined();
	});
});
