import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entryTopic } from '$lib/notebook';
import { partnerships } from '$lib/server/db/schema';
import { createNotifier } from '$lib/server/realtime/backend';
import { partnershipRoom } from '$lib/server/realtime/index';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestNotebookEntry,
	createTestPartnership,
	createTestUser,
	readNotebookEntryRow,
	type TestUser
} from '$lib/testing/fixtures';
import { createTestMediaStore, type TestMediaStore } from '$lib/testing/media';
import { actions, load } from './+page.server';

const media = vi.hoisted(() => ({ store: undefined as TestMediaStore | undefined }));
vi.mock('$lib/server/media/backend', () => ({
	createMediaStore: () => Promise.resolve(media.store)
}));

/** One shared entry: who may open it, restrict it and delete it. */

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
	await harness.db
		.update(partnerships)
		.set({ control: 'inviter' })
		.where(eq(partnerships.id, partnershipId));
});

afterEach(() => harness.close());

function at(user: TestUser, entryId: string, formData?: Record<string, string>) {
	return fakeEvent({
		db: harness.db,
		user,
		params: { id: partnershipId, entryId },
		path: `/partner/${partnershipId}/notebook/${entryId}`,
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
		expect(result).toMatchObject({
			type: 'redirect',
			location: `/partner/${partnershipId}/notebook`
		});
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
