import { and, eq, sql } from 'drizzle-orm';
import type { PictureWorkload } from '$lib/daydream/image-prompt';
import type { Db } from '$lib/server/db';
import { daydreamPictureTimings } from '$lib/server/db/schema';

/**
 * How long pictures take to make, averaged per workload, for the progress
 * ring to be drawn against (docs/daydreams.md, "Pictures"). Shared across
 * every account: a time says nothing about who asked or what of, and one
 * user's pictures would take too long to teach it anything.
 */

/**
 * The weight a new run has once the average has settled. The first few runs
 * are averaged evenly instead (a weight of 1/n), so the very first does not
 * stand as the estimate until enough others outweigh it.
 */
export const TIMING_WEIGHT = 0.2;

/**
 * The most one run counts for, as a multiple of the average so far. A cold
 * start or a queue at Runware can take several times the usual, and the
 * average is for the usual: without a cap, one such run moved it by more
 * than a typical run takes.
 */
export const TIMING_OUTLIER_CAP = 3;

/**
 * Runware's default steps or guidance, stored as 0, which no request sends:
 * the columns are NOT NULL, and a null would not match itself in the unique
 * index anyway, so every run would start a row of its own.
 */
const RUNWARE_DEFAULT = 0;

function workloadIs(workload: PictureWorkload) {
	return and(
		eq(daydreamPictureTimings.model, workload.model),
		eq(daydreamPictureTimings.steps, workload.steps ?? RUNWARE_DEFAULT),
		eq(daydreamPictureTimings.cfgScale, workload.CFGScale ?? RUNWARE_DEFAULT),
		eq(daydreamPictureTimings.width, workload.width),
		eq(daydreamPictureTimings.height, workload.height)
	);
}

/** Folds one run into its workload's average, in one statement so two runs at once cannot lose either. */
export async function recordPictureTiming(
	db: Db,
	workload: PictureWorkload,
	ms: number
): Promise<void> {
	const { averageMs, samples } = daydreamPictureTimings;
	const run = sql`min(excluded.average_ms, ${averageMs} * ${TIMING_OUTLIER_CAP})`;
	const weight = sql`max(1.0 / (${samples} + 1), ${TIMING_WEIGHT})`;
	await db
		.insert(daydreamPictureTimings)
		.values({
			model: workload.model,
			steps: workload.steps ?? RUNWARE_DEFAULT,
			cfgScale: workload.CFGScale ?? RUNWARE_DEFAULT,
			width: workload.width,
			height: workload.height,
			averageMs: ms,
			samples: 1
		})
		.onConflictDoUpdate({
			target: [
				daydreamPictureTimings.model,
				daydreamPictureTimings.steps,
				daydreamPictureTimings.cfgScale,
				daydreamPictureTimings.width,
				daydreamPictureTimings.height
			],
			set: {
				averageMs: sql`${averageMs} + ${weight} * (${run} - ${averageMs})`,
				samples: sql`${samples} + 1`,
				updatedAt: new Date()
			}
		});
}

/** How long a picture of this workload usually takes, or null for one never made here. */
export async function estimatePictureMs(db: Db, workload: PictureWorkload): Promise<number | null> {
	const [row] = await db
		.select({ averageMs: daydreamPictureTimings.averageMs })
		.from(daydreamPictureTimings)
		.where(workloadIs(workload))
		.limit(1);
	return row ? Math.round(row.averageMs) : null;
}
