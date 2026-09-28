import type { Db } from '../db';
import { sweepExpiredMedia } from '../media/expiry';
import type { LocalMediaStore } from '../media/local';

/**
 * The self-hosted server's stand-in for two things Cloudflare does for the
 * Workers build: the `*\/15 * * * *` cron trigger that runs
 * `sweepExpiredMedia` (`scheduled.ts`), and the R2 lifecycle rule that expires
 * anything under `expiring/` after 31 days (README, "Deploy setup").
 *
 * Started once from the `init` hook in `hooks.server.ts`. Relative imports
 * only, like `scheduled.ts`, so it stays reachable from either build.
 */

/** The cron trigger's cadence. */
export const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

/**
 * The lifecycle rule's age. Longer than any self-destruct timer the app
 * offers, so it only ever catches what the sweep missed — a row deleted
 * without its file, or an upload interrupted between temp file and rename.
 */
export const EXPIRING_LIFECYCLE_MS = 31 * 24 * 60 * 60 * 1000;

/** One pass: the expiry sweep, then the lifecycle backstop. */
export async function runMediaSweep(
	db: Db,
	store: LocalMediaStore,
	now: Date = new Date()
): Promise<{ purged: number; agedOut: number }> {
	const purged = await sweepExpiredMedia(db, store, now);
	const agedOut = await store.deleteOlderThan(
		'expiring/',
		new Date(now.getTime() - EXPIRING_LIFECYCLE_MS)
	);
	return { purged, agedOut };
}

/**
 * Runs `sweep` now and then every `intervalMs`, and returns a function that
 * stops it.
 *
 * A pass that is still running when the next is due is not doubled up — on a
 * slow disk two passes would race to delete the same files. A pass that fails
 * is logged and the schedule carries on, as a failed cron invocation would.
 */
export function startMediaSweep(
	sweep: () => Promise<{ purged: number; agedOut: number }>,
	intervalMs: number = SWEEP_INTERVAL_MS
): () => void {
	let running = false;

	async function tick(): Promise<void> {
		if (running) {
			return;
		}
		running = true;
		try {
			const { purged, agedOut } = await sweep();
			if (purged > 0) {
				console.info(`self-destructed ${purged} attachment(s)`);
			}
			if (agedOut > 0) {
				console.info(`aged out ${agedOut} file(s) under expiring/`);
			}
		} catch (error) {
			console.error('media sweep failed', error);
		} finally {
			running = false;
		}
	}

	void tick();
	const timer = setInterval(() => void tick(), intervalMs);
	// The HTTP server is what keeps the process alive; the sweep must not be
	// what stops it exiting on shutdown.
	timer.unref?.();
	return () => clearInterval(timer);
}
