import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasAcceptedDisclosure } from '$lib/server/daydreams';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestUser,
	grantTestDaydreams,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

let harness: TestDb;
let db: Db;
let ada: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	await grantTestDaydreams(db, ada.id);
	env.OPENROUTER_API_KEY = 'sk-or-test';
});

afterEach(() => harness.close());

const at = (user: TestUser | null) => fakeEvent({ db, user, path: '/daydreams' });

describe('load', () => {
	it('refuses an account without the feature', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		expect(await runAndCatch(() => load(at(bo)))).toMatchObject({ type: 'error', status: 403 });
	});

	it('shows the disclosure, and no daydreams, until it is accepted', async () => {
		await createTestDaydream(db, ada.id);
		expect(await runLoad(load(at(ada)))).toEqual({
			available: true,
			accepted: false,
			daydreams: []
		});
	});

	it("lists the user's daydreams once it is", async () => {
		await runAction(actions, 'acceptDisclosure', at(ada));
		const { id } = await createTestDaydream(db, ada.id);
		const data = await runLoad(load(at(ada)));
		expect(data.accepted).toBe(true);
		expect(data.daydreams.map((daydream: { id: string }) => daydream.id)).toEqual([id]);
	});

	it('says when this server has no Daydreams at all', async () => {
		env.OPENROUTER_API_KEY = undefined;
		expect((await runLoad(load(at(ada)))).available).toBe(false);
	});
});

describe('acceptDisclosure', () => {
	it('records the acceptance on the server', async () => {
		await runAction(actions, 'acceptDisclosure', at(ada));
		expect(await hasAcceptedDisclosure(db, ada.id)).toBe(true);
	});

	it('refuses an account without the feature', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		expect(await runAndCatch(() => runAction(actions, 'acceptDisclosure', at(bo)))).toMatchObject({
			type: 'error',
			status: 403
		});
		expect(await hasAcceptedDisclosure(db, bo.id)).toBe(false);
	});
});
