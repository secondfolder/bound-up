import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readSelfRewardRow,
	type TestUser
} from '$lib/testing/fixtures';
import { actions } from './+page.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
});

afterEach(() => harness.close());

const at = (user: TestUser | null, formData?: Record<string, string>) =>
	fakeEvent({ db, user, formData, path: '/home/rewards/add' });

/** A reward form as the browser posts it: the settings, and the content sealed. */
async function sealedPost(overrides: Record<string, string> = {}) {
	return {
		recordId: crypto.randomUUID(),
		vaultId: await ensureTestSelfVault(db, ada.id),
		ciphertext: fakeSealed('reward'),
		payloadVersion: '1',
		cost: '3',
		active: 'on',
		...overrides
	};
}

describe('actions', () => {
	it('creates a self reward from the sealed post and redirects', async () => {
		const post = await sealedPost();
		const result = await runAndCatch(() => actions.default?.(at(ada, post)));

		expect(result).toMatchObject({ type: 'redirect', status: 303, location: '/home/rewards' });
		await expect(readSelfRewardRow(db, post.recordId)).resolves.toMatchObject({
			ownerId: ada.id,
			ciphertext: post.ciphertext,
			vaultId: post.vaultId,
			payloadVersion: 1,
			revision: 0,
			cost: 3,
			active: true
		});
	});

	it('does not store a title the post still carries', async () => {
		const post = await sealedPost({ title: 'Bath', description: 'Hot bath' });
		await runAndCatch(() => actions.default?.(at(ada, post)));

		await expect(readSelfRewardRow(db, post.recordId)).resolves.toMatchObject({
			title: '',
			description: null,
			ciphertext: post.ciphertext
		});
	});

	it("refuses content sealed in a partnership's vault", async () => {
		const jun = await createTestUser(db, { name: 'Jun' });
		const { id } = await createTestPartnership(db, ada, jun);
		const post = await sealedPost({ vaultId: await ensureTestPartnershipVault(db, id) });

		const result = await runAndCatch(() => actions.default?.(at(ada, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 409 } });
		await expect(readSelfRewardRow(db, post.recordId)).resolves.toBeUndefined();
	});

	it('refuses a post without sealed content', async () => {
		const result = await runAndCatch(() =>
			actions.default?.(at(ada, { title: 'Bath', description: '', cost: '3', active: 'on' }))
		);
		expect(result).toMatchObject({
			type: 'ok',
			value: { status: 400, data: { error: expect.any(String) } }
		});
	});

	it('401s without a session', async () => {
		const result = await runAndCatch(() => actions.default?.(at(null, { cost: '3' })));
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});
});
