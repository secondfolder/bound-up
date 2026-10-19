import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DAYDREAM_IDEA_CHIPS, SHOWN_IDEA_CHIPS } from '$lib/daydream/starters';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
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

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	await grantTestDaydreams(db, ada.id);
});

afterEach(() => harness.close());

const at = (user: TestUser | null, formData?: Record<string, string>) =>
	fakeEvent({ db, user, formData, path: '/daydreams/new' });

async function sealedPost(overrides: Record<string, string> = {}) {
	return {
		recordId: crypto.randomUUID(),
		vaultId: await ensureTestSelfVault(db, ada.id),
		ciphertext: fakeSealed('setup'),
		payloadVersion: '1',
		...overrides
	};
}

describe('load', () => {
	it('starts from an empty setup, with the library to pick from', async () => {
		const data = await runLoad(load(at(ada)));
		expect(data.setupForm.data).toMatchObject({ title: '', lead: 'character', characters: [] });
		expect(data).toMatchObject({ library: { characters: [], scenes: [] }, accepted: false });
	});

	it('draws a few of the ideas to offer', async () => {
		const data = await runLoad(load(at(ada)));
		expect(data.ideas).toHaveLength(SHOWN_IDEA_CHIPS);
		for (const idea of data.ideas) {
			expect(DAYDREAM_IDEA_CHIPS).toContain(idea);
		}
	});

	it('refuses an account without the feature', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		expect(await runAndCatch(() => load(at(bo)))).toMatchObject({ type: 'error', status: 403 });
	});
});

describe('actions', () => {
	it('creates the daydream under the id the browser chose, and opens it', async () => {
		const post = await sealedPost();
		const result = await runAndCatch(() => runAction(actions, 'default', at(ada, post)));
		expect(result).toMatchObject({
			type: 'redirect',
			status: 303,
			location: `/daydreams/${post.recordId}`
		});
		expect(await readDaydreamRow(db, post.recordId)).toMatchObject({
			ownerId: ada.id,
			ciphertext: post.ciphertext
		});
	});

	it('stores none of the fields a post still carries in plaintext', async () => {
		const post = await sealedPost({ title: 'Secret title', scenario: 'Secret scenario' });
		await runAndCatch(() => runAction(actions, 'default', at(ada, post)));
		const row = await readDaydreamRow(db, post.recordId);
		expect(JSON.stringify(row)).not.toContain('Secret');
	});

	it('refuses a setup that is not sealed', async () => {
		const result = await runAction(
			actions,
			'default',
			at(ada, await sealedPost({ ciphertext: 'plain words' }))
		);
		expect(result).toMatchObject({ status: 400 });
	});

	it('refuses an account without the feature', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		const post = await sealedPost({ vaultId: await ensureTestSelfVault(db, bo.id) });
		expect(await runAndCatch(() => runAction(actions, 'default', at(bo, post)))).toMatchObject({
			type: 'error',
			status: 403
		});
	});
});
