import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entryTopic } from '$lib/notebook';
import { createNotifier } from '$lib/server/realtime/backend';
import { partnershipRoom } from '$lib/server/realtime/index';
import { soloSpaceFor } from '$lib/server/spaces';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestNotebookEntry,
	createTestPartnership,
	createTestUser,
	readNotebookEntryRow,
	setTestPartnershipControl,
	type TestUser
} from '$lib/testing/fixtures';
import { createTestMediaStore, type TestMediaStore } from '$lib/testing/media';
import { actions, load } from './+page.server';

const media = vi.hoisted(() => ({ store: undefined as TestMediaStore | undefined }));
vi.mock('$lib/server/media/backend', () => ({
	createMediaStore: () => Promise.resolve(media.store)
}));

/**
 * One entry: who may open it, restrict it and delete it. It is in its own
 * space whatever the context, so nothing here depends on the cookie.
 */

let harness: TestDb;
let ada: TestUser;
let bo: TestUser;
let partnershipId: string;

beforeEach(async () => {
	harness = await createTestDb();
	media.store = createTestMediaStore();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	bo = await createTestUser(harness.db, { name: 'Bo' });
	partnershipId = (await createTestPartnership(harness.db, ada, bo)).id;
	// Ada, the inviter, holds control.
	await setTestPartnershipControl(harness.db, partnershipId, 'inviter');
});

afterEach(() => harness.close());

function at(user: TestUser, entryId: string, formData?: Record<string, string>, context?: string) {
	return fakeEvent({
		db: harness.db,
		user,
		params: { entryId },
		path: `/notebook/${entryId}`,
		...(context === undefined ? {} : { contextCookie: context }),
		...(formData ? { formData } : {})
	});
}

describe('load', () => {
	it('says what the viewer may do', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, {
			partnershipId,
			partnerAccess: 'read'
		});
		const asAda = await runLoad(load(at(ada, entry.id)));
		const asBo = await runLoad(load(at(bo, entry.id)));
		expect(asAda.entry).toMatchObject({
			canWrite: true,
			canSetAccess: true,
			restrictedByViewer: true
		});
		expect(asBo.entry).toMatchObject({ canWrite: false, canSetAccess: false });
	});

	it('404s an entry hidden from the viewer', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, {
			partnershipId,
			partnerAccess: 'hidden'
		});
		const result = await runAndCatch(() => runLoad(load(at(bo, entry.id))));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});

describe('setAccess', () => {
	it('hides an entry from the other partner and closes their open copy at once', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, { partnershipId });
		const notifier = await createNotifier({});
		const bosPage = await notifier.stream(partnershipRoom(partnershipId), {
			watcher: { userId: bo.id, deviceId: null, streamId: crypto.randomUUID() },
			topics: [entryTopic(entry.id)]
		});
		const reader = defined(bosPage.body, 'the stream').getReader();
		await reader.read();

		await runAction(actions, 'setAccess', at(ada, entry.id, { access: 'hidden' }));

		expect(await readNotebookEntryRow(harness.db, entry.id)).toMatchObject({
			partnerAccess: 'hidden',
			accessSetByUserId: ada.id
		});
		// Told first, so the open page leaves at once; then closed.
		expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"access"');
		expect((await reader.read()).done).toBe(true);
	});

	/** The page hides the control from Bo; the action must not rely on that. */
	it('is refused to a partner who does not hold control, whatever the form says', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, { partnershipId });
		const result = await runAndCatch(() =>
			runAction(actions, 'setAccess', at(bo, entry.id, { access: 'hidden' }))
		);
		expect(result).toMatchObject({ type: 'error', status: 403 });
		expect((await readNotebookEntryRow(harness.db, entry.id))?.partnerAccess).toBe('edit');
	});

	/** With control shared, the say over an entry is its creator's alone. */
	it('is refused under shared control to the member who did not create the entry', async () => {
		await setTestPartnershipControl(harness.db, partnershipId, 'both');
		const entry = await createTestNotebookEntry(harness.db, ada, { partnershipId });

		expect((await runLoad(load(at(bo, entry.id)))).entry.canSetAccess).toBe(false);
		const refused = await runAndCatch(() =>
			runAction(actions, 'setAccess', at(bo, entry.id, { access: 'hidden' }))
		);
		expect(refused).toMatchObject({ type: 'error', status: 403 });

		await runAction(actions, 'setAccess', at(ada, entry.id, { access: 'read' }));
		expect((await readNotebookEntryRow(harness.db, entry.id))?.partnerAccess).toBe('read');
	});

	it('refuses an access level that is not one', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, { partnershipId });
		const result = await runAction(actions, 'setAccess', at(ada, entry.id, { access: 'secret' }));
		expect(result).toMatchObject({ status: 400, data: { form: { valid: false } } });
	});
});

describe('delete', () => {
	it('deletes for someone who may edit, and returns to the list', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, { partnershipId });
		const result = await runAndCatch(() => runAction(actions, 'delete', at(bo, entry.id)));
		expect(result).toMatchObject({ type: 'redirect', location: '/notebook' });
		expect(await readNotebookEntryRow(harness.db, entry.id)).toBeUndefined();
	});

	it('is refused to a partner who may only read', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada, {
			partnershipId,
			partnerAccess: 'read'
		});
		const result = await runAndCatch(() => runAction(actions, 'delete', at(bo, entry.id)));
		expect(result).toMatchObject({ type: 'error', status: 403 });
		expect(await readNotebookEntryRow(harness.db, entry.id)).toBeDefined();
	});
});

describe('a scene', () => {
	it('opens for both partners, with the partner a block can be hidden from', async () => {
		const scene = await createTestNotebookEntry(harness.db, ada, { partnershipId, kind: 'scene' });
		const asAda = await runLoad(load(at(ada, scene.id)));
		expect(asAda.entry.kind).toBe('scene');
		expect(asAda.scene).toMatchObject({
			preferences: null,
			partnerId: bo.id,
			partnershipId,
			// Nobody has a kink list, and characters are a Daydreams thing.
			kinkLists: { own: null, mineForPartner: null, theirs: null },
			characters: []
		});
		expect((await runLoad(load(at(bo, scene.id)))).scene).toMatchObject({ partnerId: ada.id });
	});

	it('looks like nothing to someone outside the partnership', async () => {
		const stranger = await createTestUser(harness.db, { name: 'Cy' });
		const scene = await createTestNotebookEntry(harness.db, ada, { partnershipId, kind: 'scene' });
		const result = await runAndCatch(() => runLoad(load(at(stranger, scene.id))));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it('has no scene extras for a note', async () => {
		const note = await createTestNotebookEntry(harness.db, ada, { partnershipId });
		expect((await runLoad(load(at(ada, note.id)))).scene).toBeNull();
	});
});

/** An entry is shown as its own space's, whatever the switcher says (docs/contexts.md). */
describe('the entry’s own space', () => {
	it('opens a partnership’s entry as theirs while the context is the viewer’s own', async () => {
		const adaSolo = defined(await soloSpaceFor(harness.db, ada.id), 'Ada’s own space');
		const entry = await createTestNotebookEntry(harness.db, bo, { partnershipId });

		const data = await runLoad(load(at(ada, entry.id, undefined, adaSolo)));

		expect(data.space).toEqual({ id: partnershipId, kind: 'shared', partnershipId });
		expect(data.room).toBe(`partnership:${partnershipId}`);
		// The partnership's own actions follow the partnership: Ada holds its
		// control, so she may restrict the entry, from her own context too.
		expect(data.entry.canSetAccess).toBe(true);
		const boSolo = defined(await soloSpaceFor(harness.db, bo.id), 'Bo’s own space');
		expect((await runLoad(load(at(bo, entry.id, undefined, boSolo)))).entry.canSetAccess).toBe(
			false
		);
	});

	it('opens the viewer’s own entry as theirs while the context is a partnership', async () => {
		const adaSolo = defined(await soloSpaceFor(harness.db, ada.id), 'Ada’s own space');
		const entry = await createTestNotebookEntry(harness.db, ada);
		const data = await runLoad(load(at(ada, entry.id, undefined, partnershipId)));
		expect(data.space).toEqual({ id: adaSolo, kind: 'solo', partnershipId: null });
		expect(data.entry.canSetAccess).toBe(false);
	});

	it('looks like nothing to anyone else, whatever their context', async () => {
		const entry = await createTestNotebookEntry(harness.db, ada);
		const result = await runAndCatch(() => runLoad(load(at(bo, entry.id, undefined, 'all'))));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});
