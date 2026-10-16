import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestUser,
	grantTestDaydreams,
	readDaydreamRow,
	readDaydreamTurnRows,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

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
	env.OPENROUTER_API_KEY = 'sk-or-test';
});

afterEach(() => harness.close());

const at = (user: TestUser | null, id: string) =>
	fakeEvent({ db, user, params: { id }, path: `/daydreams/${id}` });

describe('load', () => {
	it('loads the daydream and the branch being read', async () => {
		const { id, turnIds } = await createTestDaydream(db, ada.id, ['story', 'user']);
		const data = await runLoad(load(at(ada, id)));
		expect(data.daydream.path.map((turn: { id: string }) => turn.id)).toEqual(turnIds);
		expect(data.daydream.activeTurnId).toBe(turnIds.at(-1));
		expect(data).toMatchObject({ available: true, accepted: false });
	});

	it("answers someone else's daydream as not there", async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await runAndCatch(() => load(at(jun, id)))).toMatchObject({
			type: 'error',
			status: 404
		});
	});

	it('refuses an account without the feature before looking the daydream up', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		const { id } = await createTestDaydream(db, ada.id);
		expect(await runAndCatch(() => load(at(bo, id)))).toMatchObject({
			type: 'error',
			status: 403
		});
		expect(await runAndCatch(() => load(at(bo, crypto.randomUUID())))).toMatchObject({
			type: 'error',
			status: 403
		});
	});
});

describe('delete', () => {
	it('deletes the daydream and its turns, and goes back to the list', async () => {
		const { id } = await createTestDaydream(db, ada.id, ['story']);
		expect(await runAndCatch(() => runAction(actions, 'delete', at(ada, id)))).toMatchObject({
			type: 'redirect',
			status: 303,
			location: '/daydreams'
		});
		expect(await readDaydreamRow(db, id)).toBeUndefined();
		expect(await readDaydreamTurnRows(db, id)).toEqual([]);
	});

	it("does not delete someone else's", async () => {
		const { id } = await createTestDaydream(db, ada.id);
		expect(await runAndCatch(() => runAction(actions, 'delete', at(jun, id)))).toMatchObject({
			type: 'error',
			status: 404
		});
		expect(await readDaydreamRow(db, id)).toBeDefined();
	});
});
