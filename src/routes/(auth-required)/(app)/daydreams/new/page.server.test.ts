import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DAYDREAM_STARTERS } from '$lib/daydream/starters';
import type { Db } from '$lib/server/db';
import { daydreamSetupExchanges } from '$lib/server/db/schema';
import { grantFeature } from '$lib/server/features';
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
import { superformJson } from '$lib/testing/superform-json';
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
		expect(data).toMatchObject({ library: { characters: [], ideas: [] }, accepted: false });
	});

	it('draws the ready-made daydreams in an order of their own', async () => {
		const data = await runLoad(load(at(ada)));
		expect([...data.starterOrder].sort()).toEqual(
			DAYDREAM_STARTERS.map((starter) => starter.id).sort()
		);
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

	describe('how the draft was written (debug mode)', () => {
		/** A stand-in compressed ciphertext: the server checks only its shape. */
		const fakeCompressed = () => `sz1.${crypto.randomUUID().replaceAll('-', '')}`;

		async function setupExchange(user: TestUser = ada, ciphertext = fakeCompressed()) {
			return {
				id: crypto.randomUUID(),
				vaultId: await ensureTestSelfVault(db, user.id),
				ciphertext,
				payloadVersion: 1
			};
		}

		async function postWith(setupExchanges: unknown) {
			const post = await sealedPost();
			const result = await runAndCatch(() =>
				runAction(
					actions,
					'default',
					at(ada, superformJson({ ...post, payloadVersion: 1, setupExchanges }))
				)
			);
			return { post, result };
		}

		const kept = (daydreamId: string) =>
			db
				.select({
					id: daydreamSetupExchanges.id,
					daydreamId: daydreamSetupExchanges.daydreamId,
					ciphertext: daydreamSetupExchanges.ciphertext
				})
				.from(daydreamSetupExchanges)
				.where(eq(daydreamSetupExchanges.daydreamId, daydreamId))
				.orderBy(daydreamSetupExchanges.createdAt);

		const debugMode = () =>
			grantFeature(db, { userId: ada.id, feature: 'debugMode', grantedByUserId: ada.id });

		it('keeps them with the daydream, in the order they were sent, for an account with debug mode', async () => {
			await debugMode();
			const ideas = await setupExchange();
			const draft = await setupExchange();
			const { post, result } = await postWith([ideas, draft]);
			expect(result).toMatchObject({ type: 'redirect', location: `/daydreams/${post.recordId}` });
			expect(await kept(post.recordId)).toEqual([
				{ id: ideas.id, daydreamId: post.recordId, ciphertext: ideas.ciphertext },
				{ id: draft.id, daydreamId: post.recordId, ciphertext: draft.ciphertext }
			]);
		});

		it('ignores them for an account without debug mode, and still makes the daydream', async () => {
			const { post, result } = await postWith([await setupExchange()]);
			expect(result).toMatchObject({ type: 'redirect' });
			expect(await readDaydreamRow(db, post.recordId)).toBeDefined();
			expect(await kept(post.recordId)).toEqual([]);
		});

		it('drops one in someone else’s vault and keeps the rest', async () => {
			await debugMode();
			const jun = await createTestUser(db, { name: 'Jun' });
			const theirs = await setupExchange(jun);
			const mine = await setupExchange();
			const { post } = await postWith([theirs, mine]);
			expect((await kept(post.recordId)).map((row) => row.id)).toEqual([mine.id]);
		});

		it('makes the daydream when they are malformed, keeping none of them', async () => {
			await debugMode();
			const { post, result } = await postWith([await setupExchange(ada, fakeSealed('plain'))]);
			expect(result).toMatchObject({ type: 'redirect' });
			expect(await readDaydreamRow(db, post.recordId)).toBeDefined();
			expect(await kept(post.recordId)).toEqual([]);
		});

		it('takes no more than a draft and its round of ideas', async () => {
			await debugMode();
			const three = [await setupExchange(), await setupExchange(), await setupExchange()];
			const { post, result } = await postWith(three);
			expect(result).toMatchObject({ type: 'redirect' });
			expect(await kept(post.recordId)).toEqual([]);
		});
	});
});
