import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEDIA_TTL_MIN_MS } from '$lib/messaging';
import { messageAttachments } from '$lib/server/db/schema';
import { grantFeature } from '$lib/server/features';
import { startThread } from '$lib/server/messaging';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestUser,
	readAttachmentRows,
	type TestUser
} from '$lib/testing/fixtures';
import { createTestMediaStore, outgoingAttachment, type TestMediaStore } from '$lib/testing/media';
import { GET } from './+server';

const media = vi.hoisted(() => ({ store: undefined as TestMediaStore | undefined }));
vi.mock('$lib/server/media/dev', () => ({
	createMediaStore: () => Promise.resolve(media.store)
}));

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;
let partnershipId: string;

beforeEach(async () => {
	harness = await createTestDb();
	media.store = createTestMediaStore();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	jun = await createTestUser(harness.db, { name: 'Jun' });
	partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
});

afterEach(() => {
	vi.useRealTimers();
	return harness.close();
});

async function sendOne(mediaTtl: number | 'never'): Promise<string> {
	const result = await startThread(harness.db, media.store as TestMediaStore, {
		partnershipId,
		senderId: ada.id,
		icon: 'envelope',
		ciphertext: 'eA',
		attachments: [outgoingAttachment(new Uint8Array([7, 7]))],
		mediaTtl
	});
	if (!result.ok) {
		throw new Error(`expected a send, got ${result.reason}`);
	}
	const [row] = await readAttachmentRows(harness.db, result.messageId);
	if (!row) {
		throw new Error('expected an attachment row');
	}
	return row.id;
}

const download = (attachmentId: string) =>
	runAndCatch(() =>
		GET(fakeEvent({ db: harness.db, user: jun, params: { id: partnershipId, attachmentId } }))
	);

describe('GET /api/partnerships/[id]/attachments/[attachmentId]', () => {
	it('serves live media with a cache lifetime that ends when the media does', async () => {
		const id = await sendOne(MEDIA_TTL_MIN_MS);
		const result = await download(id);
		if (result.type !== 'ok') {
			throw new Error(`expected a response, got ${JSON.stringify(result)}`);
		}
		const cacheControl = result.value.headers.get('cache-control') ?? '';
		expect(cacheControl).not.toContain('immutable');
		const match: RegExpExecArray | null = /max-age=(?<seconds>\d+)/.exec(cacheControl);
		const maxAge = Number(match?.groups?.seconds);
		expect(maxAge).toBeGreaterThan(3590);
		expect(maxAge).toBeLessThanOrEqual(3600);
	});

	it('keeps immutable caching for permanent media', async () => {
		await grantFeature(harness.db, {
			userId: ada.id,
			feature: 'permanentMedia',
			grantedByUserId: jun.id
		});
		const id = await sendOne('never');
		const result = await download(id);
		if (result.type !== 'ok') {
			throw new Error('expected a response');
		}
		expect(result.value.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
	});

	// The object is still in the store — the sweep has not run — and must not
	// be served regardless.
	it('answers 410 once the media has expired, before the sweep deletes it', async () => {
		const id = await sendOne(MEDIA_TTL_MIN_MS);
		vi.useFakeTimers({ now: Date.now() + MEDIA_TTL_MIN_MS + 1000, toFake: ['Date'] });

		await expect(download(id)).resolves.toMatchObject({ type: 'error', status: 410 });
		expect(media.store?.objects.size).toBe(1);
	});

	it('answers 410 for purged media', async () => {
		const id = await sendOne(MEDIA_TTL_MIN_MS);
		await harness.db
			.update(messageAttachments)
			.set({ purgedAt: new Date() })
			.where(eq(messageAttachments.id, id));

		await expect(download(id)).resolves.toMatchObject({ type: 'error', status: 410 });
	});

	it('still 404s a stranger rather than revealing that the media expired', async () => {
		const stranger = await createTestUser(harness.db, { name: 'Stranger' });
		const id = await sendOne(MEDIA_TTL_MIN_MS);
		vi.useFakeTimers({ now: Date.now() + MEDIA_TTL_MIN_MS + 1000, toFake: ['Date'] });

		await expect(
			runAndCatch(() =>
				GET(
					fakeEvent({
						db: harness.db,
						user: stranger,
						params: { id: partnershipId, attachmentId: id }
					})
				)
			)
		).resolves.toMatchObject({ type: 'error', status: 404 });
	});
});
