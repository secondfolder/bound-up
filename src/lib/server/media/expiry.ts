import { and, asc, inArray, isNull, lte } from 'drizzle-orm';
import type { Db } from '../db';
import { messageAttachments } from '../db/schema';
import type { MediaStore } from './index';

/**
 * Deletes self-destructed media from the store. Run by the cron trigger in
 * `src/lib/server/scheduled.ts`, every quarter hour.
 *
 * **Alias-free**, like everything `scheduled.ts` imports: wrangler's esbuild
 * bundles that entry, and it resolves none of SvelteKit's aliases.
 *
 * This is what stops paying for the storage; it is not what makes media
 * disappear. Readers compare `expires_at` themselves (`isAttachmentExpired` in
 * `server/messaging.ts`), so an object the sweep has not reached yet is
 * already refused with a 410.
 *
 * The object is deleted first and the row marked after. A run that dies in
 * between re-deletes the same keys next time, which R2 treats as a no-op —
 * the other order would leave a row marked purged over an object nobody will
 * ever delete. The row itself stays: it is a few bytes, and it is what lets a
 * thread say the media self-destructed rather than that it is missing.
 */
export async function sweepExpiredMedia(
	db: Db,
	store: MediaStore,
	now: Date = new Date(),
	options: { batchSize?: number; maxBatches?: number } = {}
): Promise<number> {
	// 1000 is R2's per-call delete limit. D1 caps bound parameters at 100 per
	// statement, which is why the update below is chunked separately.
	const batchSize = options.batchSize ?? 1000;
	// A backstop against a run outliving its invocation, not an expected
	// ceiling: 20 batches is 20,000 files per quarter hour.
	const maxBatches = options.maxBatches ?? 20;
	let purged = 0;

	for (let batch = 0; batch < maxBatches; batch += 1) {
		const rows = await db
			.select({ id: messageAttachments.id, storageKey: messageAttachments.storageKey })
			.from(messageAttachments)
			.where(and(isNull(messageAttachments.purgedAt), lte(messageAttachments.expiresAt, now)))
			.orderBy(asc(messageAttachments.expiresAt))
			.limit(batchSize);
		if (rows.length === 0) {
			break;
		}

		await store.delete(rows.map((row) => row.storageKey));

		const ids = rows.map((row) => row.id);
		const chunks: string[][] = [];
		for (let at = 0; at < ids.length; at += UPDATE_CHUNK) {
			chunks.push(ids.slice(at, at + UPDATE_CHUNK));
		}
		const [first, ...rest] = chunks.map((chunk) =>
			db
				.update(messageAttachments)
				.set({ purgedAt: now })
				.where(inArray(messageAttachments.id, chunk))
		);
		if (first) {
			await db.batch([first, ...rest]);
		}

		purged += rows.length;
		if (rows.length < batchSize) {
			break;
		}
	}

	return purged;
}

/** Under D1's 100 bound parameters per statement, with room for `purged_at`. */
const UPDATE_CHUNK = 90;
