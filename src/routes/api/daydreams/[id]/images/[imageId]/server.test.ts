import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PICTURE_BYTES } from '$lib/daydream/image-prompt';
import { daydreamPictureKey } from '$lib/server/media';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestDaydream,
	createTestUser,
	grantTestDaydreams,
	type TestUser
} from '$lib/testing/fixtures';
import { createTestMediaStore, type TestMediaStore } from '$lib/testing/media';
import { GET, PUT } from './+server';

const media = vi.hoisted(() => ({ store: undefined as TestMediaStore | undefined }));
vi.mock('$lib/server/media/backend', () => ({
	createMediaStore: () => Promise.resolve(media.store)
}));

const CIPHERTEXT = new Uint8Array([97, 103, 101, 1, 2, 3]);
const IMAGE_ID = '00000000-0000-4000-8000-0000000000aa';

let harness: TestDb;
let ada: TestUser;
let store: TestMediaStore;

beforeEach(async () => {
	harness = await createTestDb();
	store = createTestMediaStore();
	media.store = store;
	ada = await createTestUser(harness.db, { name: 'Ada' });
	await grantTestDaydreams(harness.db, ada.id);
});

afterEach(() => {
	harness.close();
});

function put(
	user: TestUser | null,
	id: string,
	bytes: Uint8Array = CIPHERTEXT,
	imageId = IMAGE_ID,
	headers: Record<string, string> = {}
) {
	const request = new Request(`https://app.test/api/daydreams/${id}/images/${imageId}`, {
		method: 'PUT',
		headers: { 'content-length': String(bytes.length), ...headers },
		body: new Blob([bytes as BlobPart])
	});
	return runAndCatch(() =>
		PUT(fakeEvent({ db: harness.db, user, params: { id, imageId }, request }))
	);
}

function get(user: TestUser | null, id: string, imageId = IMAGE_ID) {
	return runAndCatch(() => GET(fakeEvent({ db: harness.db, user, params: { id, imageId } })));
}

describe('/api/daydreams/[id]/images/[imageId]', () => {
	it('keeps an encrypted picture under its daydream, and gives it back as it was', async () => {
		const { id } = await createTestDaydream(harness.db, ada.id);
		expect(await put(ada, id)).toMatchObject({ type: 'ok' });
		expect(store.objects.get(daydreamPictureKey(id, IMAGE_ID))).toEqual(CIPHERTEXT);

		const result = await get(ada, id);
		if (result.type !== 'ok') {
			throw new Error(`expected the picture, got ${result.type}`);
		}
		expect(result.value.headers.get('content-type')).toBe('application/octet-stream');
		expect(result.value.headers.get('cache-control')).toContain('private');
		expect(new Uint8Array(await result.value.arrayBuffer())).toEqual(CIPHERTEXT);
	});

	it('keeps it for the owner alone', async () => {
		const bo = await createTestUser(harness.db, { name: 'Bo' });
		await grantTestDaydreams(harness.db, bo.id);
		const { id } = await createTestDaydream(harness.db, ada.id);
		await put(ada, id);
		expect(await get(bo, id)).toMatchObject({ type: 'error', status: 404 });
		expect(await put(bo, id)).toMatchObject({ type: 'error', status: 404 });
		expect(await get(null, id)).toMatchObject({ type: 'error', status: 401 });
	});

	it('refuses a malformed id, and a picture too big to keep', async () => {
		const { id } = await createTestDaydream(harness.db, ada.id);
		expect(await put(ada, id, CIPHERTEXT, '../../etc')).toMatchObject({
			type: 'error',
			status: 400
		});
		expect(
			await put(ada, id, CIPHERTEXT, IMAGE_ID, { 'content-length': String(MAX_PICTURE_BYTES + 1) })
		).toMatchObject({ type: 'error', status: 413 });
		expect(store.objects.size).toBe(0);
	});

	it('answers a picture that is not there with a 404', async () => {
		const { id } = await createTestDaydream(harness.db, ada.id);
		expect(await get(ada, id)).toMatchObject({ type: 'error', status: 404 });
	});
});
