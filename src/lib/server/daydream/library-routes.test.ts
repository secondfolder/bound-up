import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestUser,
	ensureTestSelfVault,
	fakeSealed,
	grantTestDaydreams,
	type TestUser
} from '$lib/testing/fixtures';
import { listLibrary } from '../daydreams';
import { createHandler, deleteHandler, updateHandler } from './library-routes';

/**
 * The library endpoints (`api/daydreams/characters`, `…/ideas`), through the
 * handlers both routes are made of.
 */

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
	await grantTestDaydreams(db, ada.id);
	await grantTestDaydreams(db, jun.id);
});

afterEach(() => harness.close());

async function sealedBy(user: TestUser) {
	return {
		vaultId: await ensureTestSelfVault(db, user.id),
		ciphertext: fakeSealed('item'),
		payloadVersion: 1
	};
}

describe.each(['characters', 'ideas'] as const)('/api/daydreams/%s', (kind) => {
	const create = (user: TestUser | null, json: unknown) =>
		runAndCatch(() => createHandler(kind)(fakeEvent({ db, user, json })));
	const update = (user: TestUser | null, itemId: string, json: unknown) =>
		runAndCatch(() =>
			updateHandler(kind)(fakeEvent({ db, user, json, method: 'PUT', params: { itemId } }))
		);
	const remove = (user: TestUser | null, itemId: string) =>
		runAndCatch(() => deleteHandler(kind)(fakeEvent({ db, user, params: { itemId } })));

	test('adds, edits at a revision, and deletes', async () => {
		const id = crypto.randomUUID();
		const created = await create(ada, { id, ...(await sealedBy(ada)) });
		if (created.type !== 'ok') {
			throw new Error(JSON.stringify(created));
		}
		expect(created.value.status).toBe(201);
		expect(await created.value.json()).toEqual({ revision: 0 });

		const edited = await update(ada, id, { ...(await sealedBy(ada)), expectedRevision: 0 });
		if (edited.type !== 'ok') {
			throw new Error(JSON.stringify(edited));
		}
		expect(await edited.value.json()).toEqual({ revision: 1 });
		expect(await update(ada, id, { ...(await sealedBy(ada)), expectedRevision: 0 })).toMatchObject({
			status: 409
		});

		expect(await remove(ada, id)).toMatchObject({ type: 'ok' });
		expect(await listLibrary(db, ada.id, kind)).toEqual([]);
		expect(await remove(ada, id)).toMatchObject({ status: 404 });
	});

	test('refuses a visitor, an account without the feature, someone else, and plaintext', async () => {
		const id = crypto.randomUUID();
		await create(ada, { id, ...(await sealedBy(ada)) });
		const bo = await createTestUser(db, { name: 'Bo' });
		expect(await create(null, { id: crypto.randomUUID(), ...(await sealedBy(ada)) })).toMatchObject(
			{
				status: 401
			}
		);
		expect(await create(bo, { id: crypto.randomUUID(), ...(await sealedBy(bo)) })).toMatchObject({
			status: 403
		});
		expect(await update(jun, id, { ...(await sealedBy(jun)), expectedRevision: 0 })).toMatchObject({
			status: 404
		});
		expect(await remove(jun, id)).toMatchObject({ status: 404 });
		expect(
			await create(ada, {
				id: crypto.randomUUID(),
				...(await sealedBy(ada)),
				ciphertext: 'Mara, strict'
			})
		).toMatchObject({ status: 400 });
	});
});
