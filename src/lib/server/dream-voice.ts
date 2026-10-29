import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './db';
import { dreamVoiceUsage } from './db/schema';

/**
 * The daily cap on reading aloud (docs/dreams.md, "Read aloud"): speech is
 * billed per character, so each account may have so much read a day
 * (`voiceDailyCap`), counted in UTF-8 bytes as the provider bills. A day is
 * a UTC date.
 */

/** Today's key, `YYYY-MM-DD` in UTC. */
export function voiceDay(now: Date): string {
	return now.toISOString().slice(0, 10);
}

/**
 * Counts `bytes` against today's cap, before the request is made, and says
 * whether it fits. A request that would go over is refused whole and not
 * counted. Two at once may both fit where only one should: the cap is a
 * spending guard, not an exact one, and one clip is small.
 */
export async function spendVoice(
	db: Db,
	userId: string,
	bytes: number,
	cap: number,
	now: Date
): Promise<{ allowed: boolean; used: number }> {
	const day = voiceDay(now);
	const row = await db.query.dreamVoiceUsage.findFirst({
		columns: { bytes: true },
		where: and(eq(dreamVoiceUsage.userId, userId), eq(dreamVoiceUsage.day, day))
	});
	const used = row?.bytes ?? 0;
	if (used + bytes > cap) {
		return { allowed: false, used };
	}
	await db
		.insert(dreamVoiceUsage)
		.values({ userId, day, bytes })
		.onConflictDoUpdate({
			target: [dreamVoiceUsage.userId, dreamVoiceUsage.day],
			set: { bytes: sql`${dreamVoiceUsage.bytes} + ${bytes}` }
		});
	return { allowed: true, used: used + bytes };
}
