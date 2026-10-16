import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestUser,
	ensureTestSelfVault,
	fakeSealed,
	grantTestDaydreams,
	readDaydreamTurnRows,
	type TestUser
} from '$lib/testing/fixtures';
import { POST, PUT } from './+server';

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

async function turn(user: TestUser, role = 'user') {
	return {
		id: crypto.randomUUID(),
		role,
		vaultId: await ensureTestSelfVault(db, user.id),
		ciphertext: fakeSealed('turn'),
		payloadVersion: 1
	};
}

/** The response of a call that is expected to have answered rather than thrown. */
function answered(result: Awaited<ReturnType<typeof call>>): Response {
	if (result.type !== 'ok') {
		throw new Error(`expected an answer, got ${JSON.stringify(result)}`);
	}
	return result.value;
}

const call = (
	handler: typeof POST | typeof PUT,
	user: TestUser | null,
	id: string,
	json: unknown,
	method = 'POST'
) => runAndCatch(() => handler(fakeEvent({ db, user, params: { id }, json, method })));

describe('POST /api/daydreams/[id]/turns', () => {
	it('saves a sealed turn at the end of the conversation', async () => {
		const { id } = await createTestDaydream(db, ada.id, ['character']);
		const body = await turn(ada);
		const response = answered(await call(POST, ada, id, body));
		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ position: 1, revision: 0 });
		const rows = await readDaydreamTurnRows(db, id);
		expect(rows[1]).toMatchObject({ id: body.id, role: 'user', ciphertext: body.ciphertext });
	});

	it('refuses an unsigned visitor', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await call(POST, null, id, await turn(ada))).toMatchObject({
			type: 'error',
			status: 401
		});
	});

	it('refuses an account without the feature, before looking anything up', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		const { id } = await createTestDaydream(db, ada.id);
		expect(await call(POST, bo, id, await turn(bo))).toMatchObject({
			type: 'error',
			status: 403
		});
	});

	it("answers someone else's daydream as not there", async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await call(POST, jun, id, await turn(jun))).toMatchObject({
			type: 'error',
			status: 404
		});
		expect(await readDaydreamTurnRows(db, id)).toEqual([]);
	});

	it('refuses plaintext in place of a sealed record', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		const body = { ...(await turn(ada)), ciphertext: 'what I really said' };
		expect(await call(POST, ada, id, body)).toMatchObject({ type: 'error', status: 400 });
	});

	it('refuses a malformed body', async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await call(POST, ada, id, null)).toMatchObject({ type: 'error', status: 400 });
		expect(await call(POST, ada, id, { ...(await turn(ada)), role: 'system' })).toMatchObject({
			type: 'error',
			status: 400
		});
	});
});

describe('PUT /api/daydreams/[id]/turns', () => {
	it('replaces the newest character turn', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, [
			'character',
			'user',
			'character'
		]);
		const { vaultId, ciphertext, payloadVersion } = await turn(ada);
		const result = await call(
			PUT,
			ada,
			id,
			{
				turnId: defined(turnIds[2], 'latest'),
				expectedRevision: 0,
				vaultId,
				ciphertext,
				payloadVersion
			},
			'PUT'
		);
		expect(await answered(result).json()).toEqual({ revision: 1 });
		expect((await readDaydreamTurnRows(db, id))[2]?.ciphertext).toBe(ciphertext);
	});

	it('refuses an older turn, with words that say why', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, [
			'character',
			'user',
			'character'
		]);
		const { vaultId, ciphertext, payloadVersion } = await turn(ada);
		const result = await call(
			PUT,
			ada,
			id,
			{
				turnId: defined(turnIds[0], 'opening'),
				expectedRevision: 0,
				vaultId,
				ciphertext,
				payloadVersion
			},
			'PUT'
		);
		expect(result).toMatchObject({
			type: 'error',
			status: 409,
			message: expect.stringContaining('Only the newest reply')
		});
	});
});
