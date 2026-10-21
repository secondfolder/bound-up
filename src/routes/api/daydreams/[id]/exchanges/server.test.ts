import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDaydream } from '$lib/server/daydreams';
import type { Db } from '$lib/server/db';
import { daydreamExchanges } from '$lib/server/db/schema';
import { grantFeature } from '$lib/server/features';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestUser,
	ensureTestSelfVault,
	grantTestDaydreams,
	type TestUser
} from '$lib/testing/fixtures';
import { POST as save } from './+server';
import { POST as read } from './read/+server';

/**
 * Keeping a daydream's exchanges with the model: only for an account granted
 * debug mode, only for its own daydream and that daydream's turns, and only
 * in the compressed envelope its kind is sealed in.
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

async function exchange(
	user: TestUser,
	turnId: string | null,
	parentTurnId: string | null,
	ciphertext = fakeCompressed()
) {
	return {
		id: crypto.randomUUID(),
		turnId,
		parentTurnId,
		vaultId: await ensureTestSelfVault(db, user.id),
		ciphertext,
		payloadVersion: 1
	};
}

const call = (
	handler: typeof save | typeof read,
	user: TestUser | null,
	id: string,
	json: unknown
) =>
	runAndCatch(() =>
		(handler as typeof save)(fakeEvent({ db, user, params: { id }, json, method: 'POST' }))
	);

async function readBack(user: TestUser, id: string, turnIds: string[]) {
	const result = await call(read, user, id, { turnIds });
	if (result.type !== 'ok') {
		throw new Error(`expected exchanges, got ${JSON.stringify(result)}`);
	}
	return ((await result.value.json()) as { exchanges: { id: string; turnId: string | null }[] })
		.exchanges;
}

describe('POST /api/daydreams/[id]/exchanges', () => {
	it('keeps one under the passage it wrote, and one that wrote none under what it answered', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story', 'user']);
		const [opening, turn] = [defined(turnIds[0], 'opening'), defined(turnIds[1], 'turn')];
		const wrote = await exchange(ada, opening, null);
		const failed = await exchange(ada, null, turn);
		const failedOpening = await exchange(ada, null, null);
		for (const body of [wrote, failed, failedOpening]) {
			expect(await call(save, ada, id, body)).toMatchObject({ type: 'ok' });
		}
		// Asked about the turn the failure answered, it comes back too; a failed
		// opening comes back with any read. Compared as sets: saved within one
		// millisecond, rows tie on `createdAt` and fall back to their random ids,
		// so their order is not what this is about (and failed it under load).
		const ids = async (asked: string[]) =>
			new Set((await readBack(ada, id, asked)).map((row) => row.id));
		expect(await ids([opening])).toEqual(new Set([wrote.id, failedOpening.id]));
		expect(await ids([turn])).toEqual(new Set([failed.id, failedOpening.id]));
	});

	it('refuses an account without debug mode, to save or to read', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		await grantTestDaydreams(db, bo.id);
		const { id, turnIds } = await createTestDaydream(db, bo.id, ['story']);
		const body = await exchange(bo, defined(turnIds[0], 'opening'), null);
		expect(await call(save, bo, id, body)).toMatchObject({ status: 403 });
		expect(await call(read, bo, id, { turnIds })).toMatchObject({ status: 403 });
	});

	it('refuses someone else’s daydream, a turn from another, and an ordinary envelope', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story']);
		const other = await createTestDaydream(db, ada.id, ['story']);
		const opening = defined(turnIds[0], 'opening');
		expect(await call(save, jun, id, await exchange(jun, opening, null))).toMatchObject({
			status: 404
		});
		expect(await call(read, jun, id, { turnIds })).toMatchObject({ status: 404 });
		expect(
			await call(save, ada, id, await exchange(ada, defined(other.turnIds[0], 'other'), null))
		).toMatchObject({ status: 409 });
		expect(
			await call(save, ada, id, await exchange(ada, opening, null, `sb1.${crypto.randomUUID()}`))
		).toMatchObject({ status: 400 });
	});

	it('goes with its daydream', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story']);
		await call(save, ada, id, await exchange(ada, defined(turnIds[0], 'opening'), null));
		expect(await db.select({ id: daydreamExchanges.id }).from(daydreamExchanges)).toHaveLength(1);
		await deleteDaydream(db, ada.id, id);
		expect(await db.select({ id: daydreamExchanges.id }).from(daydreamExchanges)).toHaveLength(0);
	});
});
