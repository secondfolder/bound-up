import { and, eq } from 'drizzle-orm';
import type { IqTestResultInput } from '$lib/schemas/iqTestResult';
import type { Db } from '$lib/server/db';
import { iqTestResults } from '$lib/server/db/schema';
import type { IqTestResultView } from '$lib/types';

/** How many past results the test page lists. */
export const HISTORY_LIMIT = 20;

const VIEW_COLUMNS = {
	id: true,
	role: true,
	intensity: true,
	vibe: true,
	iq: true,
	correct: true,
	attempted: true,
	skipped: true,
	humiliating: true,
	themedLook: true,
	soberIq: true,
	targetIq: true,
	createdAt: true
} as const;

/** This user's results, newest first. */
export function listIqTestResults(
	db: Db,
	ownerId: string,
	limit = HISTORY_LIMIT
): Promise<IqTestResultView[]> {
	return db.query.iqTestResults.findMany({
		columns: VIEW_COLUMNS,
		where: (result, { eq: equals }) => equals(result.ownerId, ownerId),
		// `id` breaks ties so two results saved in the same millisecond still
		// come back in a stable order.
		orderBy: (result, { desc }) => [desc(result.createdAt), desc(result.id)],
		limit
	});
}

/**
 * One result, by id, for its shared page. Anyone with the link may see it:
 * the id is an unguessable UUID, and the page shows nothing of who took it.
 * `isMine` says whether the viewer did, so their own result can show their
 * history beside it; the owner itself never leaves this function.
 */
export async function getIqTestResult(
	db: Db,
	id: string,
	viewerId: string | null
): Promise<{ result: IqTestResultView; isMine: boolean } | null> {
	const row = await db.query.iqTestResults.findFirst({
		columns: { ...VIEW_COLUMNS, ownerId: true },
		where: (result, { eq: equals }) => equals(result.id, id)
	});
	if (!row) {
		return null;
	}
	const { ownerId, ...view } = row;
	return { result: view, isMine: viewerId !== null && ownerId === viewerId };
}

/** The newest result, for Today's Playroom card. */
export async function latestIqTestResult(
	db: Db,
	ownerId: string
): Promise<IqTestResultView | null> {
	const [latest] = await listIqTestResults(db, ownerId, 1);
	return latest ?? null;
}

export async function saveIqTestResult(
	db: Db,
	ownerId: string,
	result: IqTestResultInput
): Promise<IqTestResultView> {
	const [saved] = await db
		.insert(iqTestResults)
		.values({ ...result, ownerId })
		.returning({
			id: iqTestResults.id,
			role: iqTestResults.role,
			intensity: iqTestResults.intensity,
			vibe: iqTestResults.vibe,
			iq: iqTestResults.iq,
			correct: iqTestResults.correct,
			attempted: iqTestResults.attempted,
			skipped: iqTestResults.skipped,
			humiliating: iqTestResults.humiliating,
			themedLook: iqTestResults.themedLook,
			soberIq: iqTestResults.soberIq,
			targetIq: iqTestResults.targetIq,
			createdAt: iqTestResults.createdAt
		});
	if (!saved) {
		throw new Error('Inserting an IQ test result returned no row');
	}
	return saved;
}

/**
 * Delete one of this user's results. False when there is no such result *of
 * theirs* — someone else's id is indistinguishable from a missing one, so an
 * id cannot be probed.
 */
export async function deleteIqTestResult(db: Db, ownerId: string, id: string): Promise<boolean> {
	const deleted = await db
		.delete(iqTestResults)
		.where(and(eq(iqTestResults.id, id), eq(iqTestResults.ownerId, ownerId)))
		.returning({ id: iqTestResults.id });
	return deleted.length > 0;
}
