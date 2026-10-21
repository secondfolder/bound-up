import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDaydream, saveSetupExchanges } from '$lib/server/daydreams';
import type { Db } from '$lib/server/db';
import { daydreamSetupExchanges } from '$lib/server/db/schema';
import { grantFeature } from '$lib/server/features';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestUser,
	ensureTestSelfVault,
	grantTestDaydreams,
	type TestUser
} from '$lib/testing/fixtures';
import { GET } from './+server';

/**
 * How a daydream was set up: read back only by an account granted debug
 * mode, and only for its own daydream; gone with the daydream.
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
	for (const user of [ada, jun]) {
		await grantTestDaydreams(db, user.id);
		await grantFeature(db, { userId: user.id, feature: 'debugMode', grantedByUserId: user.id });
	}
});

afterEach(() => harness.close());

/** A stand-in compressed ciphertext: the server checks only its shape. */
const fakeCompressed = () => `sz1.${crypto.randomUUID().replaceAll('-', '')}`;

async function keep(user: TestUser, daydreamId: string, count = 2) {
	const vaultId = await ensureTestSelfVault(db, user.id);
	const exchanges = Array.from({ length: count }, () => ({
		id: crypto.randomUUID(),
		vaultId,
		ciphertext: fakeCompressed(),
		payloadVersion: 1
	}));
	const saved = await saveSetupExchanges(db, user.id, daydreamId, exchanges);
	if (saved !== count) {
		throw new Error(`keep: expected ${count} kept, got ${saved}`);
	}
	return exchanges;
}

const read = (user: TestUser | null, id: string) =>
	runAndCatch(() => GET(fakeEvent({ db, user, params: { id } })));

describe('GET /api/daydreams/[id]/setup-exchanges', () => {
	it('answers them sealed, in the order they were sent', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const [ideas, draft] = await keep(ada, id);
		const result = await read(ada, id);
		if (result.type !== 'ok') {
			throw new Error(`expected the exchanges, got ${JSON.stringify(result)}`);
		}
		const { exchanges } = (await result.value.json()) as {
			exchanges: { id: string; sealed: { recordId: string; ciphertext: string } }[];
		};
		expect(exchanges).toEqual([
			expect.objectContaining({
				id: ideas?.id,
				sealed: expect.objectContaining({ recordId: ideas?.id, ciphertext: ideas?.ciphertext })
			}),
			expect.objectContaining({ id: draft?.id })
		]);
	});

	it('answers none for a daydream that kept none', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const result = await read(ada, id);
		expect(result.type === 'ok' && (await result.value.json())).toEqual({ exchanges: [] });
	});

	it('refuses an account without debug mode', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		await grantTestDaydreams(db, bo.id);
		const { id } = await createTestDaydream(db, bo.id);
		expect(await read(bo, id)).toMatchObject({ type: 'error', status: 403 });
	});

	it('answers someone else’s daydream as one that is not there', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		await keep(ada, id);
		expect(await read(jun, id)).toMatchObject({ type: 'error', status: 404 });
	});

	it('refuses someone signed out', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await read(null, id)).toMatchObject({ type: 'error', status: 401 });
	});
});

describe('saveSetupExchanges', () => {
	it('keeps nothing for someone else’s daydream', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const exchanges = [
			{
				id: crypto.randomUUID(),
				vaultId: await ensureTestSelfVault(db, jun.id),
				ciphertext: fakeCompressed(),
				payloadVersion: 1
			}
		];
		expect(await saveSetupExchanges(db, jun.id, id, exchanges)).toBe(0);
	});

	it('refuses an envelope that is not compressed', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const exchanges = [
			{
				id: crypto.randomUUID(),
				vaultId: await ensureTestSelfVault(db, ada.id),
				ciphertext: `sb1.${crypto.randomUUID().replaceAll('-', '')}`,
				payloadVersion: 1
			}
		];
		expect(await saveSetupExchanges(db, ada.id, id, exchanges)).toBe(0);
	});

	it('goes with the daydream', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		await keep(ada, id);
		await deleteDaydream(db, ada.id, id);
		expect(await db.select({ id: daydreamSetupExchanges.id }).from(daydreamSetupExchanges)).toEqual(
			[]
		);
	});
});
