import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { sceneHelpConsents } from '../db/schema';

/**
 * Whether someone has agreed to a scene's text going to the model when they
 * ask for help with it. See docs/scenes.md, "Help from the model".
 */
export async function hasAcceptedSceneHelp(db: Db, userId: string): Promise<boolean> {
	const [row] = await db
		.select({ userId: sceneHelpConsents.userId })
		.from(sceneHelpConsents)
		.where(eq(sceneHelpConsents.userId, userId))
		.limit(1);
	return row !== undefined;
}

/** Idempotent: agreeing again changes nothing. */
export async function acceptSceneHelp(db: Db, userId: string): Promise<void> {
	await db.insert(sceneHelpConsents).values({ userId }).onConflictDoNothing();
}
