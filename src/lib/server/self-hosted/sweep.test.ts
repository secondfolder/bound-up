import { mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEDIA_TTL_MIN_MS } from '../../messaging';
import { createTestDb, type TestDb } from '../../testing/db';
import {
	createTestPartnership,
	createTestUser,
	readAttachmentRows,
	type TestUser
} from '../../testing/fixtures';
import { outgoingAttachment } from '../../testing/media';
import { attachmentKey } from '../media';
import { createLocalStore, type LocalMediaStore } from '../media/local';
import { startThread } from '../messaging';
import { EXPIRING_LIFECYCLE_MS, runMediaSweep, startMediaSweep } from './sweep';

const HOUR = 60 * 60 * 1000;
const sentAt = new Date(1_000_000_000_000);

describe('runMediaSweep', () => {
	let harness: TestDb;
	let root: string;
	let store: LocalMediaStore;
	let ada: TestUser;
	let partnershipId: string;

	beforeEach(async () => {
		harness = await createTestDb();
		root = await mkdtemp(path.join(tmpdir(), 'bound-up-sweep-'));
		store = createLocalStore(root);
		ada = await createTestUser(harness.db, { name: 'Ada' });
		const jun = await createTestUser(harness.db, { name: 'Jun' });
		partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
	});

	afterEach(async () => {
		harness.close();
		await rm(root, { recursive: true, force: true });
	});

	// The real local store rather than the in-memory fake, because this is the
	// pairing that runs in the Docker image.
	it('self-destructs expired attachments from the directory', async () => {
		const result = await startThread(
			harness.db,
			store,
			{
				partnershipId,
				senderId: ada.id,
				icon: 'envelope',
				ciphertext: 'eA',
				attachments: [outgoingAttachment(new Uint8Array([1]), MEDIA_TTL_MIN_MS)]
			},
			sentAt
		);
		if (!result.ok) {
			throw new Error(`expected a send, got ${result.reason}`);
		}
		const [row] = await readAttachmentRows(harness.db, result.messageId);
		await expect(store.get(row?.storageKey ?? '')).resolves.not.toBeNull();

		await expect(
			runMediaSweep(harness.db, store, new Date(sentAt.getTime() + HOUR))
		).resolves.toEqual({ purged: 1, agedOut: 0 });
		await expect(store.get(row?.storageKey ?? '')).resolves.toBeNull();
	});

	// The R2 lifecycle rule's job: a file under `expiring/` with no row left to
	// sweep it still goes, once it is older than any timer could have been.
	it('ages out orphaned files under expiring/ past the lifecycle age', async () => {
		const orphan = attachmentKey('expiring', partnershipId, 'gone', 'a1');
		const recent = attachmentKey('expiring', partnershipId, 'gone', 'a2');
		for (const key of [orphan, recent]) {
			await store.put(key, new Blob([new Uint8Array([1])]).stream(), 1);
		}
		const now = new Date();
		const old = new Date(now.getTime() - EXPIRING_LIFECYCLE_MS - HOUR);
		await utimes(path.join(root, orphan), old, old);

		await expect(runMediaSweep(harness.db, store, now)).resolves.toEqual({
			purged: 0,
			agedOut: 1
		});
		await expect(store.get(orphan)).resolves.toBeNull();
		await expect(store.get(recent)).resolves.not.toBeNull();
	});
});

describe('startMediaSweep', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('runs at once and then on every interval until stopped', async () => {
		const sweep = vi.fn(async () => ({ purged: 0, agedOut: 0 }));
		const stop = startMediaSweep(sweep, 1000);
		expect(sweep).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(3000);
		expect(sweep).toHaveBeenCalledTimes(4);

		stop();
		await vi.advanceTimersByTimeAsync(3000);
		expect(sweep).toHaveBeenCalledTimes(4);
	});

	it('does not start a pass while the previous one is still running', async () => {
		let finish: () => void = () => undefined;
		const sweep = vi.fn(
			() =>
				new Promise<{ purged: number; agedOut: number }>((resolve) => {
					finish = () => resolve({ purged: 0, agedOut: 0 });
				})
		);
		const stop = startMediaSweep(sweep, 1000);
		await vi.advanceTimersByTimeAsync(5000);
		expect(sweep).toHaveBeenCalledTimes(1);

		finish();
		await vi.advanceTimersByTimeAsync(1000);
		expect(sweep).toHaveBeenCalledTimes(2);
		stop();
	});

	it('keeps to the schedule after a pass fails', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const sweep = vi
			.fn<() => Promise<{ purged: number; agedOut: number }>>()
			.mockRejectedValueOnce(new Error('disk full'))
			.mockResolvedValue({ purged: 0, agedOut: 0 });
		const stop = startMediaSweep(sweep, 1000);
		await vi.advanceTimersByTimeAsync(1000);
		expect(sweep).toHaveBeenCalledTimes(2);
		expect(error).toHaveBeenCalledWith('media sweep failed', expect.any(Error));
		stop();
		error.mockRestore();
	});
});
