import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MEDIA_TTL_MIN_MS } from '../../messaging';
import { createTestDb, type TestDb } from '../../testing/db';
import {
	createTestPartnership,
	createTestUser,
	readAttachmentRows,
	type TestUser
} from '../../testing/fixtures';
import { createTestMediaStore, outgoingAttachment, type TestMediaStore } from '../../testing/media';
import { grantFeature } from '../features';
import { startThread } from '../messaging';
import { sweepExpiredMedia } from './expiry';

let harness: TestDb;
let store: TestMediaStore;
let ada: TestUser;
let partnershipId: string;

const HOUR = 60 * 60 * 1000;
const sentAt = new Date(1_000_000_000_000);
const later = (ms: number) => new Date(sentAt.getTime() + ms);

beforeEach(async () => {
	harness = await createTestDb();
	store = createTestMediaStore();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	const jun = await createTestUser(harness.db, { name: 'Jun' });
	partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
	await grantFeature(harness.db, {
		userId: ada.id,
		feature: 'permanentMedia',
		grantedByUserId: jun.id
	});
});

afterEach(() => harness.close());

async function send(mediaTtl: number | 'never', files = 1): Promise<string> {
	const result = await startThread(
		harness.db,
		store,
		{
			partnershipId,
			senderId: ada.id,
			icon: 'envelope',
			ciphertext: 'eA',
			attachments: Array.from({ length: files }, (_, index) =>
				outgoingAttachment(new Uint8Array([index]))
			),
			mediaTtl
		},
		sentAt
	);
	if (!result.ok) {
		throw new Error(`expected a send, got ${result.reason}`);
	}
	return result.messageId;
}

describe('sweepExpiredMedia', () => {
	it('deletes expired objects and marks their rows, leaving everything else alone', async () => {
		const short = await send(MEDIA_TTL_MIN_MS);
		const long = await send(3 * HOUR);
		const forever = await send('never');
		expect(store.objects.size).toBe(3);

		await expect(sweepExpiredMedia(harness.db, store, later(2 * HOUR))).resolves.toBe(1);

		const [shortRow] = await readAttachmentRows(harness.db, short);
		expect(shortRow?.purgedAt).toEqual(later(2 * HOUR));
		expect(store.objects.has(shortRow?.storageKey ?? '')).toBe(false);

		for (const messageId of [long, forever]) {
			const [row] = await readAttachmentRows(harness.db, messageId);
			expect(row?.purgedAt).toBeNull();
			expect(store.objects.has(row?.storageKey ?? '')).toBe(true);
		}
	});

	// The row is what lets a thread say the media self-destructed rather than
	// that it is missing.
	it('keeps the row after deleting the object', async () => {
		const messageId = await send(MEDIA_TTL_MIN_MS);
		await sweepExpiredMedia(harness.db, store, later(HOUR));
		await expect(readAttachmentRows(harness.db, messageId)).resolves.toHaveLength(1);
	});

	it('is a no-op the second time', async () => {
		await send(MEDIA_TTL_MIN_MS);
		await expect(sweepExpiredMedia(harness.db, store, later(HOUR))).resolves.toBe(1);
		await expect(sweepExpiredMedia(harness.db, store, later(HOUR))).resolves.toBe(0);
	});

	it('works through more expired files than one batch holds', async () => {
		await send(MEDIA_TTL_MIN_MS, 5);
		await send(MEDIA_TTL_MIN_MS, 2);

		await expect(sweepExpiredMedia(harness.db, store, later(HOUR), { batchSize: 3 })).resolves.toBe(
			7
		);
		expect(store.objects.size).toBe(0);
	});

	// More than D1's 100 bound parameters in one `IN (…)`, which is why the
	// update is chunked.
	it('marks more rows than one statement can bind', async () => {
		for (let message = 0; message < 25; message += 1) {
			await send(MEDIA_TTL_MIN_MS, 6);
		}
		await expect(sweepExpiredMedia(harness.db, store, later(HOUR))).resolves.toBe(150);
		await expect(sweepExpiredMedia(harness.db, store, later(HOUR))).resolves.toBe(0);
	});

	it('stops after its batch budget and picks up the rest on the next run', async () => {
		await send(MEDIA_TTL_MIN_MS, 4);
		await expect(
			sweepExpiredMedia(harness.db, store, later(HOUR), { batchSize: 1, maxBatches: 2 })
		).resolves.toBe(2);
		await expect(sweepExpiredMedia(harness.db, store, later(HOUR))).resolves.toBe(2);
	});

	// Object first, row second: a run that dies between them is retried rather
	// than leaving a row marked purged over an object nobody will delete.
	it('leaves rows unmarked when the store fails, so the next run retries', async () => {
		const messageId = await send(MEDIA_TTL_MIN_MS);
		const broken = { ...store, delete: () => Promise.reject(new Error('R2 is having a day')) };
		await expect(sweepExpiredMedia(harness.db, broken, later(HOUR))).rejects.toThrow(/R2/);

		const [row] = await readAttachmentRows(harness.db, messageId);
		expect(row?.purgedAt).toBeNull();
		await expect(sweepExpiredMedia(harness.db, store, later(HOUR))).resolves.toBe(1);
	});
});
