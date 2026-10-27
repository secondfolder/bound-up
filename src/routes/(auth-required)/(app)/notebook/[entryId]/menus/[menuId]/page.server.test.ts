import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestNotebookEntry,
	createTestPartnership,
	createTestUser,
	type TestUser
} from '$lib/testing/fixtures';
import { load } from './+page.server';

/**
 * A scene's menu on its own page: the scene's own access, and only a
 * scene. Whether the menu is in it is the browser's to say. See
 * docs/scenes.md, "A menu's own page".
 */

let harness: TestDb;
let ada: TestUser;
let bo: TestUser;
let partnershipId: string;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	bo = await createTestUser(harness.db, { name: 'Bo' });
	partnershipId = (await createTestPartnership(harness.db, ada, bo)).id;
});

afterEach(() => harness.close());

function at(user: TestUser, entryId: string) {
	return fakeEvent({
		db: harness.db,
		user,
		params: { entryId, menuId: 'a-menu' },
		path: `/notebook/${entryId}/menus/a-menu`
	});
}

describe('load', () => {
	it('gives the scene and the menu asked for, and what the viewer may do', async () => {
		const scene = await createTestNotebookEntry(harness.db, ada, {
			partnershipId,
			kind: 'scene',
			partnerAccess: 'read'
		});
		const asAda = await runLoad(load(at(ada, scene.id)));
		const asBo = await runLoad(load(at(bo, scene.id)));
		expect(asAda).toMatchObject({
			menuId: 'a-menu',
			entry: { id: scene.id, canWrite: true },
			space: { id: partnershipId, kind: 'shared', partnershipId }
		});
		expect(asBo.entry).toMatchObject({ canWrite: false });
		// Nothing the scene's prompt column needs.
		expect(asAda).not.toHaveProperty('scene');
	});

	it('404s a scene hidden from the viewer', async () => {
		const scene = await createTestNotebookEntry(harness.db, ada, {
			partnershipId,
			kind: 'scene',
			partnerAccess: 'hidden'
		});
		const result = await runAndCatch(() => runLoad(load(at(bo, scene.id))));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it('404s an entry that is not a scene', async () => {
		const note = await createTestNotebookEntry(harness.db, ada, { partnershipId, kind: 'note' });
		const result = await runAndCatch(() => runLoad(load(at(ada, note.id))));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});
