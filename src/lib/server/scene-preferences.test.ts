import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '$lib/testing/db';
import {
	createTestUser,
	ensureTestSelfVault,
	fakeSealed,
	type TestUser
} from '$lib/testing/fixtures';
import type { Db } from './db';
import { getScenePreferences, saveScenePreferences } from './scene-preferences';

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

async function content(userId: string, label = 'preferences') {
	return {
		vaultId: await ensureTestSelfVault(db, userId),
		ciphertext: fakeSealed(label),
		payloadVersion: 1
	};
}

describe('saveScenePreferences', () => {
	it('creates the settings, then edits them compare-and-swap on the revision', async () => {
		const id = crypto.randomUUID();
		expect(await getScenePreferences(db, ada.id)).toBeNull();
		expect(
			await saveScenePreferences(db, ada.id, {
				id,
				content: await content(ada.id, 'first'),
				expectedRevision: null
			})
		).toEqual({ ok: true, revision: 0 });

		const second = await content(ada.id, 'second');
		expect(
			await saveScenePreferences(db, ada.id, { id, content: second, expectedRevision: 0 })
		).toEqual({ ok: true, revision: 1 });
		expect(await getScenePreferences(db, ada.id)).toEqual({
			revision: 1,
			sealed: { recordId: id, ...second }
		});
	});

	/** Two devices saving at once: the later one is told, and merges. */
	it('refuses a stale revision and a second first save', async () => {
		const id = crypto.randomUUID();
		await saveScenePreferences(db, ada.id, {
			id,
			content: await content(ada.id),
			expectedRevision: null
		});
		expect(
			await saveScenePreferences(db, ada.id, {
				id: crypto.randomUUID(),
				content: await content(ada.id),
				expectedRevision: null
			})
		).toEqual({ ok: false, reason: 'conflict' });
		expect(
			await saveScenePreferences(db, ada.id, {
				id,
				content: await content(ada.id),
				expectedRevision: 5
			})
		).toEqual({ ok: false, reason: 'conflict' });
	});

	it('refuses settings sealed to somebody else’s vault, or not sealed at all', async () => {
		expect(
			await saveScenePreferences(db, ada.id, {
				id: crypto.randomUUID(),
				content: await content(jun.id),
				expectedRevision: null
			})
		).toEqual({ ok: false, reason: 'wrong-vault' });
		expect(
			await saveScenePreferences(db, ada.id, {
				id: crypto.randomUUID(),
				content: { ...(await content(ada.id)), ciphertext: 'plain text' },
				expectedRevision: null
			})
		).toEqual({ ok: false, reason: 'bad-content' });
	});

	it('keeps each person’s settings to themselves', async () => {
		await saveScenePreferences(db, ada.id, {
			id: crypto.randomUUID(),
			content: await content(ada.id),
			expectedRevision: null
		});
		expect(await getScenePreferences(db, jun.id)).toBeNull();
	});
});
