import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLibraryItem } from '$lib/server/daydreams';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestUser,
	ensureTestSelfVault,
	fakeSealed,
	grantTestDaydreams,
	type TestUser
} from '$lib/testing/fixtures';
import { load as loadScenes } from '../scenes/+page.server';
import { load } from './+page.server';

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

const at = (user: TestUser | null, path: string) => fakeEvent({ db, user, path });

describe('the library pages', () => {
	it('list the owner’s characters, and scenes, each on its own page', async () => {
		const content = {
			vaultId: await ensureTestSelfVault(db, ada.id),
			ciphertext: fakeSealed('item'),
			payloadVersion: 1
		};
		const id = crypto.randomUUID();
		await createLibraryItem(db, ada.id, 'characters', { id, content });
		const characters = await runLoad(load(at(ada, '/daydreams/characters')));
		expect(characters.items.map((item: { id: string }) => item.id)).toEqual([id]);
		expect(characters).toMatchObject({ accepted: false });
		const scenes = await runLoad(loadScenes(at(ada, '/daydreams/scenes')));
		expect(scenes.items).toEqual([]);
	});

	it('refuse an account without the feature', async () => {
		const bo = await createTestUser(db, { name: 'Bo' });
		expect(await runAndCatch(() => load(at(bo, '/daydreams/characters')))).toMatchObject({
			status: 403
		});
		expect(await runAndCatch(() => loadScenes(at(bo, '/daydreams/scenes')))).toMatchObject({
			status: 403
		});
	});
});
