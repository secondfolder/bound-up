import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestUser,
	ensureTestSelfVault,
	fakeSealed,
	grantTestDaydreams,
	readDaydreamRow,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

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

const at = (user: TestUser | null, id: string, formData?: Record<string, string>) =>
	fakeEvent({ db, user, formData, params: { id }, path: `/daydreams/${id}/edit` });

async function sealedPost(id: string, overrides: Record<string, string> = {}) {
	return {
		recordId: id,
		vaultId: await ensureTestSelfVault(db, ada.id),
		ciphertext: fakeSealed('edited'),
		payloadVersion: '1',
		expectedRevision: '0',
		...overrides
	};
}

describe('load', () => {
	it('loads the sealed setup for the browser to open', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const data = await runLoad(load(at(ada, id)));
		expect(data.daydream).toMatchObject({ id, revision: 0, setup: { recordId: id } });
	});

	it("answers someone else's daydream as not there", async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await runAndCatch(() => load(at(jun, id)))).toMatchObject({
			type: 'error',
			status: 404
		});
	});
});

describe('actions', () => {
	it('saves the new setup and goes back to the daydream', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const post = await sealedPost(id);
		expect(await runAndCatch(() => runAction(actions, 'default', at(ada, id, post)))).toMatchObject(
			{
				type: 'redirect',
				location: `/daydreams/${id}`
			}
		);
		expect(await readDaydreamRow(db, id)).toMatchObject({
			ciphertext: post.ciphertext,
			revision: 1
		});
	});

	it('refuses a stale edit, keeping the newer one', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		// Both opened at revision 0; the first to save wins.
		const first = await sealedPost(id);
		await runAndCatch(() => runAction(actions, 'default', at(ada, id, first)));
		const stale = await sealedPost(id);
		expect(await runAction(actions, 'default', at(ada, id, stale))).toMatchObject({ status: 409 });
		expect((await readDaydreamRow(db, id))?.ciphertext).toBe(first.ciphertext);
	});

	it('refuses a setup sealed to some other record', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const post = await sealedPost(id, { recordId: crypto.randomUUID() });
		expect(await runAction(actions, 'default', at(ada, id, post))).toMatchObject({ status: 400 });
	});

	it("does not edit someone else's", async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const post = await sealedPost(id, { vaultId: await ensureTestSelfVault(db, jun.id) });
		expect(await runAction(actions, 'default', at(jun, id, post))).toMatchObject({ status: 404 });
	});
});
