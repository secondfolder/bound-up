import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { FEATURES, type FeatureKey, isFeatureKey } from '../features';
import type { Db } from './db';
import { userFeatures } from './db/schema';

/**
 * Every database access for feature access. See docs/features-and-admin.md.
 *
 * The check that matters is `requireFeature`, in the load or action that serves
 * the feature. `listUserFeatures` feeds page data, which decides what to *show*
 * and must never be what decides what is *allowed*.
 */

export async function listUserFeatures(db: Db, userId: string): Promise<FeatureKey[]> {
	const rows = await db.query.userFeatures.findMany({
		where: eq(userFeatures.userId, userId),
		columns: { feature: true }
	});
	// A row for a feature since removed from FEATURES is ignored rather than
	// passed on as a key nothing can resolve.
	return rows.map((row) => row.feature).filter(isFeatureKey);
}

export async function userHasFeature(
	db: Db,
	userId: string,
	feature: FeatureKey
): Promise<boolean> {
	const row = await db.query.userFeatures.findFirst({
		where: and(eq(userFeatures.userId, userId), eq(userFeatures.feature, feature)),
		columns: { id: true }
	});
	return row !== undefined;
}

/**
 * Throws a 403 unless the user holds `feature`. Call it before reading
 * anything the feature serves, in every load and every action for it: a
 * layout's check does not gate an action, and the layout's `features` list is
 * display-only.
 */
export async function requireFeature(db: Db, userId: string, feature: FeatureKey): Promise<void> {
	if (!(await userHasFeature(db, userId, feature))) {
		error(403, `Your account does not have access to ${FEATURES[feature].name}.`);
	}
}

/** Idempotent: granting a feature the user already holds changes nothing. */
export async function grantFeature(
	db: Db,
	grant: { userId: string; feature: FeatureKey; grantedByUserId: string }
): Promise<void> {
	await db
		.insert(userFeatures)
		.values({ ...grant, source: 'grant' })
		.onConflictDoNothing({ target: [userFeatures.userId, userFeatures.feature] });
}

export async function revokeFeature(db: Db, userId: string, feature: FeatureKey): Promise<void> {
	await db
		.delete(userFeatures)
		.where(and(eq(userFeatures.userId, userId), eq(userFeatures.feature, feature)));
}
